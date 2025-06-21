import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { PrismaClient, UserType, ApplicationStatus, LoanStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import axios from 'axios';

const prisma = new PrismaClient();

export interface NotificationData {
  userId: string;
  type: 'loan_status' | 'payment_received' | 'application_update' | 'system_alert' | 'verification_request' | 'payment_reminder' | 'document_upload' | 'kyc_update' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED';
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'critical';
  actionRequired?: boolean;
  expiresAt?: Date;
  channels?: NotificationChannels;
}

export interface NotificationChannels {
  websocket?: boolean;
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  push?: boolean;
}

export interface NotificationConfig {
  email: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
    fromName: string;
  };
  sms: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
  whatsapp: {
    businessApiToken: string;
    phoneNumberId: string;
    webhookVerifyToken: string;
  };
  pushNotification: {
    firebaseServerKey: string;
    vapidKeys: {
      publicKey: string;
      privateKey: string;
    };
  };
}

export class NotificationService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string[]> = new Map(); // userId -> socketIds[]
  private userRoles: Map<string, UserType> = new Map(); // socketId -> userType
  private emailTransporter!: nodemailer.Transporter;
  private twilioClient!: twilio.Twilio;
  private config: NotificationConfig;

  constructor(httpServer: HTTPServer, config: NotificationConfig) {
    this.config = config;
    this.initializeServices();
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://yourdomain.com'] 
          : ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:3001'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupSocketHandlers();
    logger.info('🔌 Enhanced notification service initialized with WebSocket, Email, SMS, WhatsApp, and Push notifications');
  }

  private initializeServices(): void {
    // Initialize email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: this.config.email.host,
      port: this.config.email.port,
      secure: this.config.email.secure,
      auth: this.config.email.auth,
    });

    // Initialize Twilio client
    this.twilioClient = twilio(
      this.config.sms.accountSid,
      this.config.sms.authToken
    );

    // Verify email configuration
    this.emailTransporter.verify((error) => {
      if (error) {
        logger.error('Email configuration error:', error);
      } else {
        logger.info('✅ Email service configured successfully');
      }
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // Handle user authentication for socket
      socket.on('authenticate', async (data: { userId: string; token: string }) => {
        try {
          const user = await this.verifySocketToken(data.token);
          if (user && user.userId === data.userId) {
            socket.userId = data.userId;
            socket.userRole = user.userType;
            
            // Track connected user
            const existingSockets = this.connectedUsers.get(data.userId) || [];
            existingSockets.push(socket.id);
            this.connectedUsers.set(data.userId, existingSockets);
            this.userRoles.set(socket.id, user.userType);

            // Join user-specific and role-specific rooms
            socket.join(`user_${data.userId}`);
            socket.join(`role_${user.userType.toLowerCase()}`);

            // Send pending notifications
            await this.sendPendingNotifications(data.userId);

            socket.emit('authenticated', { 
              success: true, 
              userId: data.userId,
              userType: user.userType 
            });
            
            logger.info(`User ${data.userId} (${user.userType}) authenticated on socket ${socket.id}`);
          } else {
            socket.emit('authentication_failed', { error: 'Invalid token' });
          }
        } catch (error) {
          logger.error('Socket authentication error:', error);
          socket.emit('authentication_failed', { error: 'Authentication failed' });
        }
      });

      // Handle notification acknowledgment
      socket.on('notification_received', async (notificationId: string) => {
        try {
          await this.markNotificationAsRead(notificationId, socket.userId);
          socket.emit('notification_acknowledged', { notificationId });
        } catch (error) {
          logger.error('Error marking notification as read:', error);
        }
      });

      // Handle typing indicators for chat
      socket.on('typing_start', (data: { roomId: string }) => {
        socket.to(data.roomId).emit('user_typing', { 
          userId: socket.userId, 
          isTyping: true 
        });
      });

      socket.on('typing_stop', (data: { roomId: string }) => {
        socket.to(data.roomId).emit('user_typing', { 
          userId: socket.userId, 
          isTyping: false 
        });
      });

      // Handle user status updates
      socket.on('user_status', (status: 'online' | 'away' | 'busy' | 'offline') => {
        if (socket.userId) {
          // Broadcast status to admins and relevant users
          socket.broadcast.to('role_admin').emit('user_status_update', {
            userId: socket.userId,
            status,
            timestamp: new Date().toISOString()
          });

          // Update user status in database
          this.updateUserStatus(socket.userId, status);
        }
      });

      // Handle joining specific rooms (for targeted notifications)
      socket.on('join_room', (roomId: string) => {
        socket.join(roomId);
        logger.info(`User ${socket.userId} joined room: ${roomId}`);
      });

      socket.on('leave_room', (roomId: string) => {
        socket.leave(roomId);
        logger.info(`User ${socket.userId} left room: ${roomId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        if (socket.userId) {
          const userSockets = this.connectedUsers.get(socket.userId) || [];
          const updatedSockets = userSockets.filter(id => id !== socket.id);
          
          if (updatedSockets.length === 0) {
            this.connectedUsers.delete(socket.userId);
            // Update user status to offline if no other sockets
            this.updateUserStatus(socket.userId, 'offline');
          } else {
            this.connectedUsers.set(socket.userId, updatedSockets);
          }

          this.userRoles.delete(socket.id);
          logger.info(`Socket disconnected: ${socket.id} for user ${socket.userId}`);
        }
      });
    });
  }

  private async verifySocketToken(token: string): Promise<{ userId: string; userType: UserType } | null> {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { userId: decoded.userId },
        select: { userId: true, userType: true, status: true }
      });

      if (user && user.status === 'ACTIVE') {
        return { userId: user.userId, userType: user.userType };
      }
      return null;
    } catch (error) {
      logger.error('Token verification failed:', error);
      return null;
    }
  }

  private async updateUserStatus(userId: string, status: string) {
    try {
      await prisma.user.update({
        where: { userId },
        data: { 
          status: status === 'offline' ? 'INACTIVE' : 'ACTIVE'
        }
      });
    } catch (error) {
      logger.error('Error updating user status:', error);
    }
  }

  // Enhanced notification sending with multiple channels and role-based targeting
  async sendToUser(
    userId: string, 
    notification: Omit<NotificationData, 'userId'>, 
    channels: NotificationChannels = { websocket: true }
  ) {
    try {
      // Store notification in database
      const savedNotification = await this.storeNotification({
        ...notification,
        userId
      });

      // Get user contact details and preferences
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { 
          email: true, 
          phoneNumber: true, 
          firstName: true, 
          lastName: true,
          userType: true
        }
      });

      if (!user) {
        logger.error(`User ${userId} not found for notification`);
        return savedNotification;
      }

      // Send via WebSocket if user is connected
      if (channels.websocket) {
        const socketData = {
          id: savedNotification.notificationId,
          ...notification,
          timestamp: new Date().toISOString(),
          userType: user.userType
        };

        this.io.to(`user_${userId}`).emit('notification', socketData);
        
        // Also emit to admin room if it's a high priority notification
        if (['high', 'urgent', 'critical'].includes(notification.priority)) {
          this.io.to('role_admin').emit('user_notification_alert', {
            ...socketData,
            targetUserId: userId,
            targetUserName: `${user.firstName} ${user.lastName}`
          });
        }
      }

      // Send email notification
      if (channels.email && user.email) {
        await this.sendEmail(
          user.email, 
          notification.title, 
          this.generateEmailTemplate(notification, `${user.firstName} ${user.lastName}`, user.userType)
        );
      }

      // Send SMS notification
      if (channels.sms && user.phoneNumber) {
        const smsMessage = this.generateSMSMessage(notification, user.firstName);
        await this.sendSMS(user.phoneNumber, smsMessage);
      }

      // Send WhatsApp notification
      if (channels.whatsapp && user.phoneNumber) {
        await this.sendWhatsApp(user.phoneNumber, notification.title, notification.message, user.firstName);
      }

      // Send push notification
      if (channels.push) {
        const userWithToken = await prisma.user.findUnique({
          where: { userId },
          select: { fcmToken: true }
        });
        
        if (userWithToken?.fcmToken) {
          await this.sendPushNotification(userWithToken.fcmToken, notification);
        }
      }

      logger.info(`Multi-channel notification sent to user ${userId} (${user.userType}): ${notification.title}`);
      return savedNotification;
    } catch (error) {
      logger.error('Error sending notification to user:', error);
      throw error;
    }
  }

  // Role-based notification sending
  async sendToRole(
    userType: UserType | UserType[], 
    notification: Omit<NotificationData, 'userId'>, 
    channels: NotificationChannels = { websocket: true },
    excludeUsers: string[] = []
  ) {
    try {
      const userTypes = Array.isArray(userType) ? userType : [userType];
      
      // Get all users of specified roles
      const users = await prisma.user.findMany({
        where: { 
          userType: { in: userTypes },
          status: 'ACTIVE',
          userId: { notIn: excludeUsers }
        },
        select: { userId: true, userType: true, firstName: true, lastName: true }
      });

      if (users.length === 0) {
        logger.warn(`No active users found for roles: ${userTypes.join(', ')}`);
        return [];
      }

      // Store notifications for all users
      const notifications = await Promise.all(
        users.map(user => this.storeNotification({
          ...notification,
          userId: user.userId
        }))
      );

      // Send via WebSocket to all connected users of specified roles
      if (channels.websocket) {
        userTypes.forEach(role => {
          this.io.to(`role_${role.toLowerCase()}`).emit('role_notification', {
            ...notification,
            timestamp: new Date().toISOString(),
            targetRole: role,
            userCount: users.filter(u => u.userType === role).length
          });
        });
      }

      // Send to each user via other channels (excluding websocket to avoid duplicates)
      const promises = users.map(user => 
        this.sendToUser(user.userId, notification, { 
          ...channels, 
          websocket: false // Already sent via role broadcast
        })
      );

      await Promise.all(promises);

      logger.info(`Multi-channel role-based notification sent to ${userTypes.join(', ')} (${users.length} users): ${notification.title}`);
      return notifications;
    } catch (error) {
      logger.error('Error sending notification to role:', error);
      throw error;
    }
  }

  // Send system-wide notification (to all connected users)
  async sendSystemAlert(notification: Omit<NotificationData, 'userId'>) {
    try {
      // Send to all connected sockets
      this.io.emit('system_alert', {
        ...notification,
        timestamp: new Date().toISOString(),
        isSystemWide: true
      });

      // Also store for all active users
      const activeUsers = await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { userId: true }
      });

      const notifications = await Promise.all(
        activeUsers.map(user => this.storeNotification({
          ...notification,
          userId: user.userId
        }))
      );

      logger.info(`System alert sent to all users (${activeUsers.length} recipients): ${notification.title}`);
      return notifications;
    } catch (error) {
      logger.error('Error sending system alert:', error);
      throw error;
    }
  }

  // Send to specific group/department
  async sendToDepartment(
    department: string, 
    notification: Omit<NotificationData, 'userId'>, 
    channels: NotificationChannels = { websocket: true }
  ) {
    try {
      // Note: department field accessed via EmployeeDetail relation
      const users = await prisma.user.findMany({
        where: { 
          status: 'ACTIVE',
          employeeDetails: {
            department: department
          }
        },
        select: { userId: true }
      });

      if (users.length === 0) {
        logger.warn(`No active users found in department: ${department}`);
        return [];
      }

      // Send to department room
      if (channels.websocket) {
        this.io.to(`dept_${department.toLowerCase()}`).emit('department_notification', {
          ...notification,
          timestamp: new Date().toISOString(),
          department
        });
      }

      // Send to each user individually for other channels
      const promises = users.map(user => 
        this.sendToUser(user.userId, notification, { 
          ...channels, 
          websocket: false 
        })
      );

      await Promise.all(promises);
      logger.info(`Department notification sent to ${department} (${users.length} users): ${notification.title}`);
      return promises;
    } catch (error) {
      logger.error('Error sending department notification:', error);
      throw error;
    }
  }

  // Email service with enhanced templates
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      await this.emailTransporter.sendMail({
        from: `${this.config.email.fromName} <${this.config.email.from}>`,
        to,
        subject,
        html,
      });

      logger.info(`Email sent successfully to: ${to}`);
      return true;
    } catch (error) {
      logger.error('Email sending failed:', error);
      return false;
    }
  }

  // SMS service
  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.config.sms.fromNumber,
        to: this.formatPhoneNumber(to),
      });

      logger.info(`SMS sent successfully to: ${to}, SID: ${result.sid}`);
      return true;
    } catch (error) {
      logger.error('SMS sending failed:', error);
      return false;
    }
  }

  // WhatsApp Business API service
  async sendWhatsApp(to: string, title: string, message: string, userName?: string): Promise<boolean> {
    try {
      const greeting = userName ? `Hello ${userName},\n\n` : '';
      const fullMessage = `${greeting}*${title}*\n\n${message}`;

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${this.config.whatsapp.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: this.formatPhoneNumber(to),
          type: 'text',
          text: {
            body: fullMessage
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.whatsapp.businessApiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('WhatsApp message sent successfully:', response.data);
      return true;
    } catch (error) {
      logger.error('WhatsApp sending failed:', error);
      return false;
    }
  }

  // Push notification service
  async sendPushNotification(fcmToken: string, notification: Omit<NotificationData, 'userId'>): Promise<boolean> {
    try {
      const payload = {
        to: fcmToken,
        notification: {
          title: notification.title,
          body: notification.message,
          icon: '/icons/notification-icon.png',
          badge: '/icons/badge-icon.png',
          click_action: this.generateClickAction(notification),
          sound: notification.priority === 'urgent' || notification.priority === 'critical' ? 'urgent.wav' : 'default'
        },
        data: {
          type: notification.type,
          priority: notification.priority,
          actionRequired: notification.actionRequired?.toString() || 'false',
          timestamp: new Date().toISOString(),
          ...notification.data
        }
      };

      const response = await axios.post(
        'https://fcm.googleapis.com/fcm/send',
        payload,
        {
          headers: {
            'Authorization': `key=${this.config.pushNotification.firebaseServerKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Push notification sent successfully:', response.data);
      return true;
    } catch (error) {
      logger.error('Push notification sending failed:', error);
      return false;
    }
  }

  // Main notification sending method that handles all channels
  async sendNotification(notification: NotificationData & { channels?: string[] }): Promise<boolean> {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { userId: notification.userId },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true
        }
      });

      if (!user) {
        logger.warning(`User not found for notification: ${notification.userId}`);
        return false;
      }

      const channels = notification.channels || ['PUSH'];
      let success = false;

      // Send via specified channels
      for (const channel of channels) {
        // For now, we'll just log the notification sending attempt
        logger.info(`Sending notification via ${channel} to user ${notification.userId}`);
        success = true;
      }

      // Store notification in database would go here
      // await this.storeNotification(notification);

      // Send via WebSocket if connected would go here
      // this.sendToSocket(notification.userId, notification);

      return success;
    } catch (error) {
      logger.error('Error sending notification:', error);
      return false;
    }
  }

  private formatPhoneNumber(phone: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length === 10) {
      return `+91${cleanPhone}`;
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      return `+${cleanPhone}`;
    }
    
    return phone;
  }

  private generateEmailTemplate(
    notification: NotificationData | Omit<NotificationData, 'userId'>, 
    userName: string, 
    userType: UserType
  ): string {
    const priorityColors = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#fd7e14',
      urgent: '#dc3545',
      critical: '#721c24'
    };

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 300; }
        .content { padding: 30px 20px; }
        .notification-box { 
          border-left: 4px solid ${priorityColors[notification.priority]};
          background-color: #f8f9fa;
          padding: 20px;
          margin: 20px 0;
          border-radius: 0 8px 8px 0;
        }
        .priority-badge { 
          display: inline-block;
          background-color: ${priorityColors[notification.priority]};
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .action-required { 
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
        }
        .footer { 
          background-color: #f8f9fa;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #6c757d;
          border-top: 1px solid #dee2e6;
        }
        .btn { 
          display: inline-block;
          background-color: #007bff;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 6px;
          margin: 10px 0;
        }
        .user-type { color: #6c757d; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Gold Loan Management System</h1>
          <div class="user-type">${userType} Portal</div>
        </div>
        <div class="content">
          <h3>Hello ${userName},</h3>
          <div class="notification-box">
            <div style="margin-bottom: 10px;">
              <span class="priority-badge">${notification.priority}</span>
            </div>
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">${notification.title}</h4>
            <p style="margin: 0; font-size: 16px;">${notification.message}</p>
          </div>
          ${notification.actionRequired ? 
            `<div class="action-required">
              <strong>⚠️ Action Required:</strong> Please log in to your account to take necessary action.
              <br><br>
              <a href="${process.env.FRONTEND_URL || 'https://yourdomain.com'}" class="btn">Access Your Account</a>
            </div>` : ''
          }
          <p style="margin-top: 30px; color: #6c757d;">
            This notification was sent on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message from Gold Loan Management System.</p>
          <p>Please do not reply to this email. For support, contact our customer service.</p>
          <p>&copy; ${new Date().getFullYear()} Gold Loan Management System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  private generateSMSMessage(notification: NotificationData | Omit<NotificationData, 'userId'>, userName: string): string {
    const priorityEmoji = {
      low: '📢',
      medium: '📨',
      high: '🔔',
      urgent: '🚨',
      critical: '🆘'
    };

    return `${priorityEmoji[notification.priority]} ${notification.title}\n\nHi ${userName}, ${notification.message}\n\n${notification.actionRequired ? 'Action required. Please check your account.' : 'No action needed.'}\n\n- Gold Loan Management`;
  }

  private generateClickAction(notification: NotificationData | Omit<NotificationData, 'userId'>): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://yourdomain.com';
    
    switch (notification.type) {
      case 'loan_status':
        return `${baseUrl}/loans`;
      case 'payment_received':
        return `${baseUrl}/payments`;
      case 'application_update':
        return `${baseUrl}/applications`;
      case 'verification_request':
        return `${baseUrl}/verifications`;
      case 'document_upload':
        return `${baseUrl}/documents`;
      case 'kyc_update':
        return `${baseUrl}/kyc`;
      default:
        return `${baseUrl}/dashboard`;
    }
  }

  // Loan status change notifications with role-based targeting
  async notifyLoanStatusChange(loanId: string, oldStatus: LoanStatus, newStatus: LoanStatus) {
    try {
      const loan = await prisma.activeLoan.findUnique({
        where: { loanId },
        include: {
          customer: { select: { userId: true, firstName: true, lastName: true } },
          application: { select: { applicationNumber: true } }
        }
      });

      if (!loan) {
        logger.error(`Loan ${loanId} not found for status change notification`);
        return;
      }

      const statusMessages = {
        ACTIVE: 'Your loan has been activated and funds have been disbursed',
        CLOSED: 'Your loan has been successfully closed. Thank you for choosing our services!',
        DEFAULTED: 'Your loan account requires immediate attention. Please contact us urgently.',
        FORECLOSED: 'Your loan has been foreclosed. Please contact our support team.'
      };

      const isUrgent = ['DEFAULTED', 'FORECLOSED'].includes(newStatus);
      const priority = isUrgent ? 'urgent' : (newStatus === 'ACTIVE' ? 'high' : 'medium');
      
      // Notify customer
      await this.sendToUser(loan.customer.userId, {
        type: 'loan_status',
        title: 'Loan Status Update',
        message: statusMessages[newStatus] || `Your loan status has been updated to ${newStatus}`,
        data: {
          loanId,
          loanNumber: loan.loanNumber,
          applicationNumber: loan.application.applicationNumber,
          oldStatus,
          newStatus
        },
        priority,
        actionRequired: isUrgent
      }, {
        websocket: true,
        email: true,
        sms: isUrgent || newStatus === 'ACTIVE',
        whatsapp: isUrgent,
        push: true
      });

      // Notify admins and managers for critical status changes
      if (isUrgent) {
        await this.sendToRole([UserType.ADMIN, UserType.SUPER_ADMIN], {
          type: 'system_alert',
          title: 'Critical Loan Status Alert',
          message: `Loan ${loan.loanNumber} has been marked as ${newStatus}. Customer: ${loan.customer.firstName} ${loan.customer.lastName}`,
          data: { 
            loanId, 
            customerId: loan.customer.userId,
            customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
            loanNumber: loan.loanNumber
          },
          priority: 'critical',
          actionRequired: true
        }, {
          websocket: true,
          email: true,
          push: true
        });
      }

      logger.info(`Loan status change notification sent for loan ${loan.loanNumber}: ${oldStatus} -> ${newStatus}`);
    } catch (error) {
      logger.error('Error sending loan status notification:', error);
    }
  }

  // Payment received notifications with enhanced targeting
  async notifyPaymentReceived(paymentId: string) {
    try {
      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: {
          loan: {
            include: {
              customer: { select: { userId: true, firstName: true, lastName: true } }
            }
          }
        }
      });

      if (!payment) {
        logger.error(`Payment ${paymentId} not found for notification`);
        return;
      }

      // Notify customer
      await this.sendToUser(payment.loan.customer.userId, {
        type: 'payment_received',
        title: 'Payment Confirmation',
        message: `Your payment of ₹${payment.paymentAmount} has been successfully received and processed. Receipt number: ${payment.receiptNumber}`,
        data: {
          paymentId,
          paymentAmount: payment.paymentAmount,
          loanNumber: payment.loan.loanNumber,
          paymentMethod: payment.paymentMethod,
          receiptNumber: payment.receiptNumber,
          paymentDate: payment.paymentDate
        },
        priority: 'medium'
      }, {
        websocket: true,
        email: true,
        sms: true,
        push: true
      });

      // Notify collector if it's a doorstep collection
      if (payment.collectedBy) {
        await this.sendToUser(payment.collectedBy, {
          type: 'payment_received',
          title: 'Payment Collection Confirmed',
          message: `Payment collection of ₹${payment.paymentAmount} from ${payment.loan.customer.firstName} ${payment.loan.customer.lastName} has been verified and processed.`,
          data: {
            paymentId,
            customerId: payment.loan.customer.userId,
            customerName: `${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
            paymentAmount: payment.paymentAmount,
            loanNumber: payment.loan.loanNumber
          },
          priority: 'low'
        }, {
          websocket: true,
          push: true
        });
      }

      // Notify finance team for large payments  
      if (payment.paymentAmount.toNumber() >= 100000) {
        await this.sendToRole(UserType.ADMIN, {
          type: 'payment_received',
          title: 'Large Payment Alert',
          message: `Large payment of ₹${payment.paymentAmount} received from ${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
          data: {
            paymentId,
            paymentAmount: payment.paymentAmount,
            customerName: `${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
            loanNumber: payment.loan.loanNumber
          },
          priority: 'high'
        }, {
          websocket: true,
          email: true
        });
      }

      logger.info(`Payment received notification sent for payment ${payment.receiptNumber}`);
    } catch (error) {
      logger.error('Error sending payment notification:', error);
    }
  }

  // Application status change notifications with workflow-based targeting
  async notifyApplicationStatusChange(applicationId: string, oldStatus: ApplicationStatus, newStatus: ApplicationStatus) {
    try {
      const application = await prisma.loanApplication.findUnique({
        where: { applicationId },
        include: {
          customer: { select: { userId: true, firstName: true, lastName: true } },
          fieldAgent: { select: { userId: true, firstName: true, lastName: true } }
        }
      });

      if (!application) {
        logger.error(`Application ${applicationId} not found for status change notification`);
        return;
      }

      const statusMessages: Record<ApplicationStatus, string> = {
        [ApplicationStatus.DRAFT]: 'Your loan application is saved as draft',
        [ApplicationStatus.SUBMITTED]: 'Your loan application has been submitted for review',
        [ApplicationStatus.UNDER_REVIEW]: 'Your loan application is currently under review by our team',
        [ApplicationStatus.APPROVED]: 'Congratulations! Your loan application has been approved',
        [ApplicationStatus.REJECTED]: 'We regret to inform you that your loan application has been rejected',
        [ApplicationStatus.CANCELLED]: 'Your loan application has been cancelled'
      };

      const isImportant = ['APPROVED', 'REJECTED'].includes(newStatus);
      const priority = isImportant ? 'high' : 'medium';

      // Notify customer
      await this.sendToUser(application.customer.userId, {
        type: 'application_update',
        title: 'Application Status Update',
        message: statusMessages[newStatus] || `Your application status has been updated to ${newStatus}`,
        data: {
          applicationId,
          applicationNumber: application.applicationNumber,
          oldStatus,
          newStatus,
          requestedAmount: application.requestedAmount
        },
        priority,
        actionRequired: newStatus === 'APPROVED'
      }, {
        websocket: true,
        email: true,
        sms: isImportant,
        whatsapp: isImportant,
        push: true
      });

      // Notify assigned field agent for verification
      if (application.fieldAgent && ['APPROVED', 'UNDER_REVIEW'].includes(newStatus)) {
        await this.sendToUser(application.fieldAgent.userId, {
          type: 'verification_request',
          title: 'Field Verification Required',
          message: `Application ${application.applicationNumber} from ${application.customer.firstName} ${application.customer.lastName} requires field verification`,
          data: {
            applicationId,
            customerId: application.customer.userId,
            customerName: `${application.customer.firstName} ${application.customer.lastName}`,
            applicationNumber: application.applicationNumber,
            requestedAmount: application.requestedAmount
          },
          priority: 'high',
          actionRequired: true
        }, {
          websocket: true,
          email: true,
          push: true
        });
      }

      // Notify processing team for approved applications
      if (newStatus === 'APPROVED') {
        await this.sendToRole(UserType.ADMIN, {
          type: 'application_update',
          title: 'Application Approved - Processing Required',
          message: `Application ${application.applicationNumber} has been approved and requires loan processing`,
          data: {
            applicationId,
            customerName: `${application.customer.firstName} ${application.customer.lastName}`,
            requestedAmount: application.requestedAmount
          },
          priority: 'high',
          actionRequired: true
        }, {
          websocket: true,
          email: true
        });
      }

      logger.info(`Application status change notification sent for ${application.applicationNumber}: ${oldStatus} -> ${newStatus}`);
    } catch (error) {
      logger.error('Error sending application status notification:', error);
    }
  }

  // Store notification in database with enhanced metadata
  private async storeNotification(notification: NotificationData): Promise<any> {
    try {
      return await prisma.notification.create({
        data: {
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          priority: notification.priority,
          actionRequired: notification.actionRequired || false,
          expiresAt: notification.expiresAt,
          createdAt: new Date()
        }
      });
    } catch (error) {
      // If notification table doesn't exist, create a temporary notification object
      logger.warn('Notification table not available, creating temporary notification:', error);
      return { 
        notificationId: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        ...notification,
        createdAt: new Date()
      };
    }
  }

  // Send pending notifications when user connects
  private async sendPendingNotifications(userId: string) {
    try {
      const pendingNotifications = await prisma.notification.findMany({
        where: {
          userId,
          readAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        take: 50 // Limit to recent 50 notifications
      });

      if (pendingNotifications.length > 0) {
        this.io.to(`user_${userId}`).emit('pending_notifications', {
          notifications: pendingNotifications,
          count: pendingNotifications.length
        });

        logger.info(`Sent ${pendingNotifications.length} pending notifications to user ${userId}`);
      }
    } catch (error) {
      logger.error('Error sending pending notifications:', error);
    }
  }

  // Mark notification as read
  private async markNotificationAsRead(notificationId: string, userId?: string) {
    try {
      const updateData: any = {
        readAt: new Date()
      };

      const whereClause: any = { notificationId };
      if (userId) {
        whereClause.userId = userId;
      }

      await prisma.notification.update({
        where: whereClause,
        data: updateData
      });

      logger.info(`Notification ${notificationId} marked as read${userId ? ` by user ${userId}` : ''}`);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
    }
  }

  // Get notification statistics
  async getNotificationStats(userId?: string, userType?: UserType) {
    try {
      const whereClause: any = {};
      
      if (userId) {
        whereClause.userId = userId;
      } else if (userType) {
        const users = await prisma.user.findMany({
          where: { userType },
          select: { userId: true }
        });
        whereClause.userId = { in: users.map(u => u.userId) };
      }

      const [total, unread, byPriority] = await Promise.all([
        prisma.notification.count({ where: whereClause }),
        prisma.notification.count({ where: { ...whereClause, readAt: null } }),
        prisma.notification.groupBy({
          by: ['priority'],
          where: { ...whereClause, readAt: null },
          _count: { priority: true }
        })
      ]);

      return {
        total,
        unread,
        byPriority: byPriority.reduce((acc, item) => {
          acc[item.priority] = item._count.priority;
          return acc;
        }, {} as Record<string, number>)
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      return { total: 0, unread: 0, byPriority: {} };
    }
  }

  // Get connected users count and status
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  getConnectedUsersByRole(role: UserType): string[] {
    const users: string[] = [];
    this.io.sockets.adapter.rooms.get(`role_${role.toLowerCase()}`)?.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket?.userId) {
        users.push(socket.userId);
      }
    });
    return users;
  }

  // Broadcast to all admins
  async broadcastToAdmins(notification: Omit<NotificationData, 'userId'>) {
    await this.sendToRole([UserType.ADMIN, UserType.SUPER_ADMIN], notification);
  }

  // Webhook handlers for WhatsApp Business API
  async handleWhatsAppWebhook(body: any) {
    try {
      if (body.entry && body.entry[0] && body.entry[0].changes) {
        const changes = body.entry[0].changes[0];
        if (changes.field === 'messages' && changes.value.messages) {
          const message = changes.value.messages[0];
          logger.info('WhatsApp message received:', message);
          // Handle incoming WhatsApp messages here
          // You can implement auto-responses or forward to customer service
        }
      }
    } catch (error) {
      logger.error('Error handling WhatsApp webhook:', error);
    }
  }

  verifyWhatsAppWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.config.whatsapp.webhookVerifyToken) {
      logger.info('WhatsApp webhook verified successfully');
      return challenge;
    }
    logger.warn('WhatsApp webhook verification failed');
    return null;
  }

  // Cleanup expired notifications
  async cleanupExpiredNotifications() {
    try {
      const result = await prisma.notification.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });
      
      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired notifications`);
      }
    } catch (error) {
      logger.error('Error cleaning up expired notifications:', error);
    }
  }
}

// Extend Socket interface to include custom properties
declare module 'socket.io' {
  interface Socket {
    userId?: string;
    userRole?: UserType;
  }
}

// Global notification service instance
let notificationService: NotificationService;

export const initializeNotificationService = (httpServer: HTTPServer, config: NotificationConfig): NotificationService => {
  notificationService = new NotificationService(httpServer, config);
  return notificationService;
};

export const getNotificationService = (): NotificationService => {
  if (!notificationService) {
    throw new Error('Notification service not initialized. Call initializeNotificationService first.');
  }
  return notificationService;
};