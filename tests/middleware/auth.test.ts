import { authenticateToken } from '../../src/middleware/auth';
import { PrismaClient } from '@prisma/client';
import {
  createMockUser,
  generateTestToken,
  createMockRequest,
  createMockResponse,
  resetAllMocks
} from '../helpers/testHelpers';
import jwt from 'jsonwebtoken';

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('Auth Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    resetAllMocks();
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    mockNext = jest.fn();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual({
        userId: mockUser.userId,
        role: mockUser.userType,
        phoneNumber: mockUser.phoneNumber
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid authorization format', async () => {
      mockReq.headers.authorization = 'InvalidFormat token';

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token format'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-user-id', role: 'CUSTOMER' },
        process.env.JWT_SECRET || 'test-jwt-secret-key',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      mockReq.headers.authorization = `Bearer ${expiredToken}`;

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token for non-existent user', async () => {
      const token = generateTestToken();

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token for inactive user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser({ status: 'INACTIVE' });

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Account is inactive'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token for suspended user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser({ status: 'SUSPENDED' });

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Account is suspended'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const token = generateTestToken();

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('Database error'));

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Authentication failed'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token from query parameter', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      mockReq.query.token = token;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual({
        userId: mockUser.userId,
        role: mockUser.userType,
        phoneNumber: mockUser.phoneNumber
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prioritize header token over query parameter', async () => {
      const headerToken = generateTestToken({ userId: 'header-user' });
      const queryToken = generateTestToken({ userId: 'query-user' });
      const mockUser = createMockUser({ userId: 'header-user' });

      mockReq.headers.authorization = `Bearer ${headerToken}`;
      mockReq.query.token = queryToken;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockReq.user.userId).toBe('header-user');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle malformed token payload', async () => {
      // Create a token without required fields
      const malformedToken = jwt.sign(
        { someField: 'value' }, // Missing userId and role
        process.env.JWT_SECRET || 'test-jwt-secret-key',
        { expiresIn: '1h' }
      );

      mockReq.headers.authorization = `Bearer ${malformedToken}`;

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token payload'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should update last login timestamp', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      mockReq.headers.authorization = `Bearer ${token}`;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        lastLogin: new Date()
      });

      await authenticateToken(mockReq, mockRes, mockNext);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { userId: mockUser.userId },
        data: { lastLogin: expect.any(Date) }
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });
});