import request from 'supertest';
import app from '../../src/index';
import { PrismaClient } from '@prisma/client';
import {
  createMockUser,
  generateTestToken,
  expectValidationError,
  expectSuccessResponse,
  resetAllMocks
} from '../helpers/testHelpers';

// Mock Prisma
const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('Auth Controller', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('POST /api/v1/auth/send-otp', () => {
    it('should send OTP for valid phone number', async () => {
      const phoneNumber = '+919876543210';
      
      const response = await request(app)
        .post('/api/v1/auth/send-otp')
        .send({ phoneNumber });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('otpSent', true);
    });

    it('should return validation error for invalid phone number', async () => {
      const response = await request(app)
        .post('/api/v1/auth/send-otp')
        .send({ phoneNumber: 'invalid' });

      expectValidationError(response, 'phoneNumber');
    });

    it('should return validation error for missing phone number', async () => {
      const response = await request(app)
        .post('/api/v1/auth/send-otp')
        .send({});

      expectValidationError(response, 'phoneNumber');
    });
  });

  describe('POST /api/v1/auth/verify-otp', () => {
    it('should verify OTP and create new user', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        otpCode: '123456',
        firstName: 'Test',
        lastName: 'User'
      };

      // Mock user not found (new user)
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      
      // Mock user creation
      const mockUser = createMockUser(userData);
      (mockPrisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send(userData);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.phoneNumber).toBe(userData.phoneNumber);
    });

    it('should verify OTP and login existing user', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        otpCode: '123456'
      };

      // Mock existing user
      const mockUser = createMockUser({ phoneNumber: userData.phoneNumber });
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        lastLogin: new Date()
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send(userData);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
    });

    it('should return validation error for invalid OTP', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({
          phoneNumber: '+919876543210',
          otpCode: 'invalid'
        });

      expectValidationError(response, 'otpCode');
    });

    it('should return error for expired OTP', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({
          phoneNumber: '+919876543210',
          otpCode: '000000' // Mock expired OTP
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_OTP');
    });
  });

  describe('POST /api/v1/auth/set-pin', () => {
    it('should set PIN for authenticated user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        pinHash: 'hashed-pin'
      });

      const response = await request(app)
        .post('/api/v1/auth/set-pin')
        .set('Authorization', `Bearer ${token}`)
        .send({ pin: '123456' });

      expectSuccessResponse(response);
      expect(response.body.data.message).toContain('PIN set successfully');
    });

    it('should return validation error for invalid PIN', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/auth/set-pin')
        .set('Authorization', `Bearer ${token}`)
        .send({ pin: '123' }); // Too short

      expectValidationError(response, 'pin');
    });

    it('should return error for missing authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/set-pin')
        .send({ pin: '123456' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/login-pin', () => {
    it('should login with valid PIN', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        pin: '123456'
      };

      const mockUser = createMockUser({ 
        phoneNumber: userData.phoneNumber,
        pinHash: 'hashed-pin'
      });
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        lastLogin: new Date(),
        loginAttempts: 0
      });

      const response = await request(app)
        .post('/api/v1/auth/login-pin')
        .send(userData);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
    });

    it('should return error for invalid PIN', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        pin: 'wrong-pin'
      };

      const mockUser = createMockUser({ 
        phoneNumber: userData.phoneNumber,
        pinHash: 'hashed-pin'
      });
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/login-pin')
        .send(userData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PIN');
    });

    it('should return error for user not found', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        pin: '123456'
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/login-pin')
        .send(userData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should handle account lockout after failed attempts', async () => {
      const userData = {
        phoneNumber: '+919876543210',
        pin: 'wrong-pin'
      };

      const mockUser = createMockUser({ 
        phoneNumber: userData.phoneNumber,
        pinHash: 'hashed-pin',
        loginAttempts: 4 // One more attempt will lock account
      });
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        loginAttempts: 5,
        accountLockedUntil: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      });

      const response = await request(app)
        .post('/api/v1/auth/login-pin')
        .send(userData);

      expect(response.status).toBe(423); // Locked
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh token for valid user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout authenticated user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.message).toContain('Logged out successfully');
    });

    it('should return error for missing authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    it('should return user profile for authenticated user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expectSuccessResponse(response);
      expect(response.body.data.user).toMatchObject({
        userId: mockUser.userId,
        phoneNumber: mockUser.phoneNumber,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName
      });
    });

    it('should return error for missing authentication', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile');

      expect(response.status).toBe(401);
    });

    it('should return error for user not found', async () => {
      const token = generateTestToken();
      
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});