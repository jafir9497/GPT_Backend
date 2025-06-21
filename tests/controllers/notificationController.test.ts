import request from 'supertest';
import app from '../../src/index';
import { PrismaClient } from '@prisma/client';
import {
  createMockUser,
  createMockNotification,
  generateTestToken,
  generateAdminToken,
  createAuthHeaders,
  createAdminAuthHeaders,
  expectSuccessResponse,
  expectForbiddenError,
  resetAllMocks
} from '../helpers/testHelpers';

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('Notification Controller', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('GET /api/v1/notifications/user', () => {
    it('should get user notifications', async () => {
      const token = generateTestToken();
      const mockNotifications = [
        createMockNotification(),
        createMockNotification({ readAt: new Date() })
      ];

      (mockPrisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);
      (mockPrisma.notification.count as jest.Mock)
        .mockResolvedValueOnce(2) // total
        .mockResolvedValueOnce(1); // unread

      const response = await request(app)
        .get('/api/v1/notifications/user')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.notifications).toHaveLength(2);
      expect(response.body.data.unreadCount).toBe(1);
      expect(response.body.data.pagination.total).toBe(2);
    });

    it('should filter unread notifications only', async () => {
      const token = generateTestToken();
      const mockNotifications = [createMockNotification()];

      (mockPrisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);
      (mockPrisma.notification.count as jest.Mock)
        .mockResolvedValueOnce(1) // total unread
        .mockResolvedValueOnce(1); // unread count

      const response = await request(app)
        .get('/api/v1/notifications/user?unreadOnly=true')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.notifications).toHaveLength(1);
      expect(response.body.data.notifications[0].readAt).toBeNull();
    });

    it('should handle pagination', async () => {
      const token = generateTestToken();
      const mockNotifications = [createMockNotification()];

      (mockPrisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications);
      (mockPrisma.notification.count as jest.Mock)
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(5); // unread

      const response = await request(app)
        .get('/api/v1/notifications/user?page=2&limit=5')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.pagination.total).toBe(10);
    });

    it('should handle database error gracefully', async () => {
      const token = generateTestToken();

      // Mock database error
      (mockPrisma.notification.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/notifications/user')
        .set(createAuthHeaders(token));

      // Should return empty result when notification table doesn't exist
      expectSuccessResponse(response);
      expect(response.body.data.notifications).toEqual([]);
      expect(response.body.data.unreadCount).toBe(0);
    });
  });

  describe('PATCH /api/v1/notifications/:notificationId/read', () => {
    it('should mark notification as read', async () => {
      const token = generateTestToken();
      const mockNotification = createMockNotification({ readAt: new Date() });

      (mockPrisma.notification.update as jest.Mock).mockResolvedValue(mockNotification);

      const response = await request(app)
        .patch(`/api/v1/notifications/${mockNotification.notificationId}/read`)
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.notification.readAt).toBeTruthy();
    });

    it('should handle database error gracefully', async () => {
      const token = generateTestToken();

      // Mock database error
      (mockPrisma.notification.update as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/api/v1/notifications/test-id/read')
        .set(createAuthHeaders(token));

      // Should return success even if table doesn't exist
      expectSuccessResponse(response);
    });

    it('should return error for unauthorized request', async () => {
      const response = await request(app)
        .patch('/api/v1/notifications/test-id/read');

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/mark-all-read', () => {
    it('should mark all notifications as read', async () => {
      const token = generateTestToken();

      (mockPrisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

      const response = await request(app)
        .patch('/api/v1/notifications/mark-all-read')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.updatedCount).toBe(5);
    });

    it('should handle database error gracefully', async () => {
      const token = generateTestToken();

      // Mock database error
      (mockPrisma.notification.updateMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/api/v1/notifications/mark-all-read')
        .set(createAuthHeaders(token));

      // Should return success even if table doesn't exist
      expectSuccessResponse(response);
      expect(response.body.data.updatedCount).toBe(0);
    });
  });

  describe('POST /api/v1/notifications/test', () => {
    it('should send test notification as admin', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          title: 'Test Notification',
          message: 'This is a test',
          priority: 'low'
        });

      expectSuccessResponse(response);
      expect(response.body.data.message).toContain('Test notification sent successfully');
    });

    it('should send test notification to specific user', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          userId: 'test-user-id',
          type: 'system_alert',
          title: 'User Test',
          message: 'Test message for specific user',
          priority: 'medium'
        });

      expectSuccessResponse(response);
    });

    it('should reject non-admin request', async () => {
      const userToken = generateTestToken();

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set(createAuthHeaders(userToken))
        .send({
          title: 'Test',
          message: 'Test'
        });

      expectForbiddenError(response);
    });

    it('should validate notification data', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          type: 'invalid_type', // Invalid type
          title: 'Test',
          message: 'Test'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/notifications/stats', () => {
    it('should get notification statistics as admin', async () => {
      const adminToken = generateAdminToken();

      // Mock notification counts
      (mockPrisma.notification.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(25); // unread

      const response = await request(app)
        .get('/api/v1/notifications/stats')
        .set(createAdminAuthHeaders(adminToken));

      expectSuccessResponse(response);
      expect(response.body.data.connectedUsers).toBeDefined();
      expect(response.body.data.notifications.total).toBe(100);
      expect(response.body.data.notifications.unread).toBe(25);
    });

    it('should handle database error gracefully', async () => {
      const adminToken = generateAdminToken();

      // Mock database error
      (mockPrisma.notification.count as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/notifications/stats')
        .set(createAdminAuthHeaders(adminToken));

      expectSuccessResponse(response);
      expect(response.body.data.notifications.total).toBe(0);
      expect(response.body.data.notifications.unread).toBe(0);
    });

    it('should reject non-admin request', async () => {
      const userToken = generateTestToken();

      const response = await request(app)
        .get('/api/v1/notifications/stats')
        .set(createAuthHeaders(userToken));

      expectForbiddenError(response);
    });
  });

  describe('POST /api/v1/notifications/bulk', () => {
    it('should send bulk notification to users', async () => {
      const adminToken = generateAdminToken();

      // Mock user count
      (mockPrisma.user.count as jest.Mock).mockResolvedValue(3);

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          targetType: 'users',
          targetIds: ['user1', 'user2', 'user3'],
          type: 'system_alert',
          title: 'System Maintenance',
          message: 'System will be down for maintenance',
          priority: 'high',
          actionRequired: true,
          expiresInHours: 24
        });

      expectSuccessResponse(response);
      expect(response.body.data.sentCount).toBe(3);
    });

    it('should send bulk notification to role', async () => {
      const adminToken = generateAdminToken();

      // Mock user count for role
      (mockPrisma.user.count as jest.Mock).mockResolvedValue(5);

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          targetType: 'role',
          targetRole: 'EMPLOYEE',
          type: 'system_alert',
          title: 'Policy Update',
          message: 'New company policy has been published',
          priority: 'medium'
        });

      expectSuccessResponse(response);
      expect(response.body.data.sentCount).toBe(5);
    });

    it('should send notification to all users', async () => {
      const adminToken = generateAdminToken();

      // Mock total user count
      (mockPrisma.user.count as jest.Mock).mockResolvedValue(100);

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          targetType: 'all',
          type: 'system_alert',
          title: 'Important Announcement',
          message: 'Important system announcement for all users',
          priority: 'urgent'
        });

      expectSuccessResponse(response);
      expect(response.body.data.sentCount).toBe(100);
    });

    it('should validate bulk notification data', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          targetType: 'invalid', // Invalid target type
          type: 'system_alert',
          title: 'Test',
          message: 'Test'
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid role', async () => {
      const adminToken = generateAdminToken();

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAdminAuthHeaders(adminToken))
        .send({
          targetType: 'role',
          targetRole: 'INVALID_ROLE',
          type: 'system_alert',
          title: 'Test',
          message: 'Test'
        });

      expect(response.status).toBe(400);
    });

    it('should reject non-admin request', async () => {
      const userToken = generateTestToken();

      const response = await request(app)
        .post('/api/v1/notifications/bulk')
        .set(createAuthHeaders(userToken))
        .send({
          targetType: 'all',
          type: 'system_alert',
          title: 'Test',
          message: 'Test'
        });

      expectForbiddenError(response);
    });
  });
});