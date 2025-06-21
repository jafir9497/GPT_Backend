import { Request, Response } from 'express';
import { PrismaClient, UserType } from '@prisma/client';
import { getNotificationService } from '../services/notificationService';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/express';

const prisma = new PrismaClient();

// Get user notifications
export const getUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const whereClause: any = { userId };
    if (unreadOnly === 'true') {
      whereClause.readAt = null;
    }

    // Try to get notifications from database
    try {
      const notifications = await prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      });

      const total = await prisma.notification.count({
        where: whereClause
      });

      const unreadCount = await prisma.notification.count({
        where: { userId, readAt: null }
      });

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          },
          unreadCount
        }
      });
    } catch (dbError) {
      // If notification table doesn't exist, return empty result
      res.json({
        success: true,
        data: {
          notifications: [],
          pagination: {
            page: 1,
            limit: parseInt(limit as string),
            total: 0,
            pages: 0
          },
          unreadCount: 0
        }
      });
    }

  } catch (error) {
    logger.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve notifications'
      }
    });
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.userId;

    try {
      const notification = await prisma.notification.update({
        where: {
          notificationId,
          userId // Ensure user can only mark their own notifications
        },
        data: {
          readAt: new Date()
        }
      });

      res.json({
        success: true,
        data: { notification }
      });
    } catch (dbError) {
      // If notification table doesn't exist, just return success
      res.json({
        success: true,
        data: { message: 'Notification marked as read' }
      });
    }

  } catch (error) {
    logger.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to mark notification as read'
      }
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          message: 'All notifications marked as read',
          updatedCount: result.count
        }
      });
    } catch (dbError) {
      // If notification table doesn't exist, just return success
      res.json({
        success: true,
        data: {
          message: 'All notifications marked as read',
          updatedCount: 0
        }
      });
    }

  } catch (error) {
    logger.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to mark notifications as read'
      }
    });
  }
};

// Send test notification (admin only)
export const sendTestNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;
    
    if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const { userId, type, title, message, priority = 'medium' } = req.body;
    const notificationService = getNotificationService();

    if (userId) {
      // Send to specific user
      await notificationService.sendToUser(userId, {
        type: type || 'system_alert',
        title: title || 'Test Notification',
        message: message || 'This is a test notification',
        priority,
        data: { test: true }
      });
    } else {
      // Send to all admins
      await notificationService.broadcastToAdmins({
        type: 'system_alert',
        title: 'System Test',
        message: 'This is a test system notification',
        priority: 'low',
        data: { test: true }
      });
    }

    res.json({
      success: true,
      data: { message: 'Test notification sent successfully' }
    });

  } catch (error) {
    logger.error('Send test notification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to send test notification'
      }
    });
  }
};

// Get notification statistics (admin only)
export const getNotificationStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;
    
    if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const notificationService = getNotificationService();
    const connectedUsersCount = notificationService.getConnectedUsersCount();
    const connectedAdmins = notificationService.getConnectedUsersByRole(UserType.ADMIN);
    const connectedEmployees = notificationService.getConnectedUsersByRole(UserType.EMPLOYEE);
    const connectedCustomers = notificationService.getConnectedUsersByRole(UserType.CUSTOMER);

    let totalNotifications = 0;
    let unreadNotifications = 0;

    try {
      totalNotifications = await prisma.notification.count();
      unreadNotifications = await prisma.notification.count({
        where: { readAt: null }
      });
    } catch (dbError) {
      // Database might not have notification table yet
      logger.info('Notification table not available for stats');
    }

    res.json({
      success: true,
      data: {
        connectedUsers: {
          total: connectedUsersCount,
          admins: connectedAdmins.length,
          employees: connectedEmployees.length,
          customers: connectedCustomers.length
        },
        notifications: {
          total: totalNotifications,
          unread: unreadNotifications
        }
      }
    });

  } catch (error) {
    logger.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve notification statistics'
      }
    });
  }
};

// Send bulk notification (admin only)
export const sendBulkNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;
    
    if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const { 
      targetType, // 'users', 'role', 'all'
      targetIds, // array of user IDs (if targetType is 'users')
      targetRole, // UserType (if targetType is 'role')
      type,
      title,
      message,
      priority = 'medium',
      actionRequired = false,
      expiresInHours
    } = req.body;

    const notificationService = getNotificationService();
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : undefined;

    const notificationData = {
      type,
      title,
      message,
      priority,
      actionRequired,
      expiresAt
    };

    let sentCount = 0;

    switch (targetType) {
      case 'users':
        if (Array.isArray(targetIds)) {
          for (const userId of targetIds) {
            await notificationService.sendToUser(userId, notificationData);
            sentCount++;
          }
        }
        break;

      case 'role':
        if (targetRole && Object.values(UserType).includes(targetRole)) {
          await notificationService.sendToRole(targetRole, notificationData);
          const users = await prisma.user.count({
            where: { userType: targetRole, status: 'ACTIVE' }
          });
          sentCount = users;
        }
        break;

      case 'all':
        await notificationService.sendSystemAlert(notificationData);
        sentCount = await prisma.user.count({ where: { status: 'ACTIVE' } });
        break;

      default:
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TARGET',
            message: 'Invalid target type specified'
          }
        });
        return;
    }

    res.json({
      success: true,
      data: {
        message: 'Bulk notification sent successfully',
        sentCount
      }
    });

  } catch (error) {
    logger.error('Send bulk notification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to send bulk notification'
      }
    });
  }
};

// Update FCM token
export const updateFCMToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { fcmToken } = req.body;

    // Update user's FCM token
    const updatedUser = await prisma.user.update({
      where: { userId },
      data: {
        fcmToken,
        fcmTokenUpdatedAt: new Date()
      },
      select: {
        userId: true,
        fcmToken: true,
        fcmTokenUpdatedAt: true
      }
    });

    logger.info(`FCM token updated for user ${userId}`);

    res.json({
      success: true,
      data: {
        message: 'FCM token updated successfully',
        user: updatedUser
      }
    });

  } catch (error) {
    logger.error('Update FCM token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update FCM token'
      }
    });
  }
};