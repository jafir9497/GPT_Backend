import { Server } from 'http';
import { NotificationService, initializeNotificationService } from '../../src/services/notificationService';
import { PrismaClient, UserType, ApplicationStatus, LoanStatus } from '@prisma/client';
import {
  createMockUser,
  createMockLoanApplication,
  createMockActiveLoan,
  createMockPayment,
  resetAllMocks
} from '../helpers/testHelpers';

// Mock Socket.IO
const mockSocket = {
  id: 'test-socket-id',
  userId: 'test-user-id',
  userRole: UserType.CUSTOMER,
  join: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn()
};

const mockIo = {
  on: jest.fn(),
  to: jest.fn(() => ({ emit: jest.fn() })),
  emit: jest.fn(),
  sockets: {
    adapter: {
      rooms: new Map([
        ['role_admin', new Set(['admin-socket-1', 'admin-socket-2'])],
        ['role_customer', new Set(['customer-socket-1'])]
      ])
    },
    sockets: new Map([
      ['admin-socket-1', { userId: 'admin-1' }],
      ['admin-socket-2', { userId: 'admin-2' }],
      ['customer-socket-1', { userId: 'customer-1' }]
    ])
  }
};

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => mockIo)
}));

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockHttpServer: Server;

  beforeEach(() => {
    resetAllMocks();
    jest.clearAllMocks();
    
    mockHttpServer = {} as Server;
    notificationService = initializeNotificationService(mockHttpServer);
  });

  describe('Socket Connection Handling', () => {
    it('should handle socket connection', () => {
      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should authenticate socket with valid token', async () => {
      const connectionHandler = mockIo.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      // Mock socket authentication
      mockSocket.on = jest.fn((event, handler) => {
        if (event === 'authenticate') {
          // Simulate authentication event
          handler({ userId: 'test-user-id', token: 'valid-token' });
        }
      });

      // Mock user verification
      const mockUser = createMockUser({ userId: 'test-user-id' });
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      connectionHandler(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('authenticate', expect.any(Function));
    });
  });

  describe('sendToUser', () => {
    it('should send notification to specific user', async () => {
      const userId = 'test-user-id';
      const notification = {
        type: 'loan_status' as const,
        title: 'Loan Approved',
        message: 'Your loan has been approved',
        data: { loanId: 'loan-123' },
        priority: 'high' as const
      };

      // Mock notification storage
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notification-123',
        ...notification,
        userId
      });

      const result = await notificationService.sendToUser(userId, notification);

      expect(result).toBeDefined();
      expect(result.notificationId).toBe('notification-123');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          priority: notification.priority,
          actionRequired: false,
          expiresAt: undefined
        }
      });
    });

    it('should handle notification storage error gracefully', async () => {
      const userId = 'test-user-id';
      const notification = {
        type: 'loan_status' as const,
        title: 'Test',
        message: 'Test message',
        priority: 'medium' as const
      };

      // Mock database error
      (mockPrisma.notification.create as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await expect(notificationService.sendToUser(userId, notification)).rejects.toThrow();
    });
  });

  describe('sendToRole', () => {
    it('should send notification to all users of specific role', async () => {
      const notification = {
        type: 'system_alert' as const,
        title: 'System Maintenance',
        message: 'System will be down for maintenance',
        priority: 'urgent' as const
      };

      const mockUsers = [
        createMockUser({ userId: 'admin-1', userType: UserType.ADMIN }),
        createMockUser({ userId: 'admin-2', userType: UserType.ADMIN })
      ];

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);
      (mockPrisma.notification.create as jest.Mock)
        .mockResolvedValueOnce({ notificationId: 'notif-1', userId: 'admin-1' })
        .mockResolvedValueOnce({ notificationId: 'notif-2', userId: 'admin-2' });

      const results = await notificationService.sendToRole(UserType.ADMIN, notification);

      expect(results).toHaveLength(2);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { 
          userType: UserType.ADMIN,
          status: 'ACTIVE'
        },
        select: { userId: true }
      });
    });
  });

  describe('notifyLoanStatusChange', () => {
    it('should notify customer of loan status change', async () => {
      const loanId = 'test-loan-id';
      const oldStatus = LoanStatus.ACTIVE;
      const newStatus = LoanStatus.CLOSED;

      const mockLoan = createMockActiveLoan({
        loanId,
        customer: {
          userId: 'customer-123',
          firstName: 'John',
          lastName: 'Doe'
        },
        application: {
          applicationNumber: 'APP123'
        }
      });

      (mockPrisma.activeLoan.findUnique as jest.Mock).mockResolvedValue(mockLoan);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyLoanStatusChange(loanId, oldStatus, newStatus);

      expect(mockPrisma.activeLoan.findUnique).toHaveBeenCalledWith({
        where: { loanId },
        include: {
          customer: { select: { userId: true, firstName: true, lastName: true } },
          application: { select: { applicationNumber: true } }
        }
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'customer-123',
          type: 'loan_status',
          title: 'Loan Status Update',
          message: 'Your loan has been successfully closed'
        })
      });
    });

    it('should notify admins for defaulted loans', async () => {
      const loanId = 'test-loan-id';
      const oldStatus = LoanStatus.ACTIVE;
      const newStatus = LoanStatus.DEFAULTED;

      const mockLoan = createMockActiveLoan({
        loanId,
        customer: {
          userId: 'customer-123',
          firstName: 'John',
          lastName: 'Doe'
        },
        application: {
          applicationNumber: 'APP123'
        }
      });

      const mockAdmins = [
        createMockUser({ userId: 'admin-1', userType: UserType.ADMIN })
      ];

      (mockPrisma.activeLoan.findUnique as jest.Mock).mockResolvedValue(mockLoan);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(mockAdmins);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyLoanStatusChange(loanId, oldStatus, newStatus);

      // Should create notification for customer
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'customer-123',
          type: 'loan_status',
          priority: 'urgent'
        })
      });

      // Should also notify admins
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { 
          userType: UserType.ADMIN,
          status: 'ACTIVE'
        },
        select: { userId: true }
      });
    });

    it('should handle non-existent loan gracefully', async () => {
      const loanId = 'non-existent-loan';
      const oldStatus = LoanStatus.ACTIVE;
      const newStatus = LoanStatus.CLOSED;

      (mockPrisma.activeLoan.findUnique as jest.Mock).mockResolvedValue(null);

      // Should not throw error
      await expect(
        notificationService.notifyLoanStatusChange(loanId, oldStatus, newStatus)
      ).resolves.not.toThrow();

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('notifyPaymentReceived', () => {
    it('should notify customer of payment receipt', async () => {
      const paymentId = 'test-payment-id';

      const mockPayment = createMockPayment({
        paymentId,
        paymentAmount: 5000,
        paymentMethod: 'UPI',
        receiptNumber: 'RCP123',
        loan: {
          loanNumber: 'LOAN123',
          customer: {
            userId: 'customer-123',
            firstName: 'John',
            lastName: 'Doe'
          }
        }
      });

      (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyPaymentReceived(paymentId);

      expect(mockPrisma.payment.findUnique).toHaveBeenCalledWith({
        where: { paymentId },
        include: {
          loan: {
            include: {
              customer: { select: { userId: true, firstName: true, lastName: true } }
            }
          }
        }
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'customer-123',
          type: 'payment_received',
          title: 'Payment Confirmation',
          message: 'Your payment of ₹5000 has been received and processed'
        })
      });
    });

    it('should notify collector for doorstep collection', async () => {
      const paymentId = 'test-payment-id';

      const mockPayment = createMockPayment({
        paymentId,
        paymentAmount: 5000,
        collectedBy: 'collector-123',
        loan: {
          loanNumber: 'LOAN123',
          customer: {
            userId: 'customer-123',
            firstName: 'John',
            lastName: 'Doe'
          }
        }
      });

      (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyPaymentReceived(paymentId);

      // Should create notifications for both customer and collector
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
      
      // Check collector notification
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'collector-123',
          type: 'payment_received',
          title: 'Payment Collection Confirmed'
        })
      });
    });
  });

  describe('notifyApplicationStatusChange', () => {
    it('should notify customer of application status change', async () => {
      const applicationId = 'test-app-id';
      const oldStatus = ApplicationStatus.SUBMITTED;
      const newStatus = ApplicationStatus.APPROVED;

      const mockApplication = createMockLoanApplication({
        applicationId,
        applicationNumber: 'APP123',
        requestedAmount: 50000,
        customer: {
          userId: 'customer-123',
          firstName: 'John',
          lastName: 'Doe'
        }
      });

      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyApplicationStatusChange(applicationId, oldStatus, newStatus);

      expect(mockPrisma.loanApplication.findUnique).toHaveBeenCalledWith({
        where: { applicationId },
        include: {
          customer: { select: { userId: true, firstName: true, lastName: true } },
          fieldAgent: { select: { userId: true, firstName: true, lastName: true } }
        }
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'customer-123',
          type: 'application_update',
          title: 'Application Status Update',
          message: 'Congratulations! Your loan application has been approved',
          priority: 'high'
        })
      });
    });

    it('should notify field agent for verification', async () => {
      const applicationId = 'test-app-id';
      const oldStatus = ApplicationStatus.SUBMITTED;
      const newStatus = ApplicationStatus.UNDER_REVIEW;

      const mockApplication = createMockLoanApplication({
        applicationId,
        applicationNumber: 'APP123',
        customer: {
          userId: 'customer-123',
          firstName: 'John',
          lastName: 'Doe'
        },
        fieldAgent: {
          userId: 'agent-123',
          firstName: 'Agent',
          lastName: 'Smith'
        }
      });

      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.notifyApplicationStatusChange(applicationId, oldStatus, newStatus);

      // Should create notifications for both customer and field agent
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
      
      // Check field agent notification
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'agent-123',
          type: 'verification_request',
          title: 'Verification Required',
          priority: 'high',
          actionRequired: true
        })
      });
    });
  });

  describe('Connection Management', () => {
    it('should track connected users count', () => {
      const count = notificationService.getConnectedUsersCount();
      expect(typeof count).toBe('number');
    });

    it('should get connected users by role', () => {
      const adminUsers = notificationService.getConnectedUsersByRole(UserType.ADMIN);
      expect(Array.isArray(adminUsers)).toBe(true);
    });

    it('should broadcast to all admins', async () => {
      const notification = {
        type: 'system_alert' as const,
        title: 'System Alert',
        message: 'Critical system alert',
        priority: 'urgent' as const
      };

      const mockAdmins = [createMockUser({ userType: UserType.ADMIN })];
      const mockSuperAdmins = [createMockUser({ userType: UserType.SUPER_ADMIN })];

      (mockPrisma.user.findMany as jest.Mock)
        .mockResolvedValueOnce(mockAdmins)
        .mockResolvedValueOnce(mockSuperAdmins);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({
        notificationId: 'notif-123'
      });

      await notificationService.broadcastToAdmins(notification);

      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(2);
    });
  });
});