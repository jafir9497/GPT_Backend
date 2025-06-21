import request from 'supertest';
import app from '../../src/index';

describe('Auth Integration Tests', () => {
  const testUser = {
    phoneNumber: '+919876543210',
    firstName: 'Integration',
    lastName: 'Test'
  };

  describe('Complete Authentication Flow', () => {
    let authToken: string;
    let userId: string;

    it('should complete full authentication flow', async () => {
      // Step 1: Send OTP
      const otpResponse = await request(app)
        .post('/api/v1/auth/send-otp')
        .send({ phoneNumber: testUser.phoneNumber });

      expect(otpResponse.status).toBe(200);
      expect(otpResponse.body.success).toBe(true);

      // Step 2: Verify OTP (with mock OTP)
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({
          phoneNumber: testUser.phoneNumber,
          otpCode: '123456', // Mock OTP
          firstName: testUser.firstName,
          lastName: testUser.lastName
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.data).toHaveProperty('token');
      expect(verifyResponse.body.data).toHaveProperty('user');

      authToken = verifyResponse.body.data.token;
      userId = verifyResponse.body.data.user.userId;

      // Step 3: Set PIN
      const pinResponse = await request(app)
        .post('/api/v1/auth/set-pin')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ pin: '123456' });

      expect(pinResponse.status).toBe(200);
      expect(pinResponse.body.success).toBe(true);

      // Step 4: Login with PIN
      const loginResponse = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({
          phoneNumber: testUser.phoneNumber,
          pin: '123456'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data).toHaveProperty('token');

      // Step 5: Get Profile
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${loginResponse.body.data.token}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data.user.phoneNumber).toBe(testUser.phoneNumber);

      // Step 6: Refresh Token
      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${loginResponse.body.data.token}`);

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.data).toHaveProperty('token');

      // Step 7: Logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${refreshResponse.body.data.token}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
    });

    it('should handle authentication errors properly', async () => {
      // Test invalid OTP
      const invalidOtpResponse = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({
          phoneNumber: testUser.phoneNumber,
          otpCode: '000000' // Invalid OTP
        });

      expect(invalidOtpResponse.status).toBe(400);
      expect(invalidOtpResponse.body.success).toBe(false);

      // Test invalid PIN
      const invalidPinResponse = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({
          phoneNumber: testUser.phoneNumber,
          pin: '000000'
        });

      expect(invalidPinResponse.status).toBe(401);
      expect(invalidPinResponse.body.success).toBe(false);

      // Test unauthorized access
      const unauthorizedResponse = await request(app)
        .get('/api/v1/auth/profile');

      expect(unauthorizedResponse.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on OTP requests', async () => {
      const requests = [];
      
      // Send multiple OTP requests quickly
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/v1/auth/send-otp')
            .send({ phoneNumber: `+9198765432${i}0` })
        );
      }

      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Security Features', () => {
    it('should handle account lockout after failed attempts', async () => {
      const testPhoneNumber = '+919876543299';
      
      // First, create a user with PIN
      await request(app)
        .post('/api/v1/auth/send-otp')
        .send({ phoneNumber: testPhoneNumber });

      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({
          phoneNumber: testPhoneNumber,
          otpCode: '123456',
          firstName: 'Test',
          lastName: 'User'
        });

      const token = verifyResponse.body.data.token;

      await request(app)
        .post('/api/v1/auth/set-pin')
        .set('Authorization', `Bearer ${token}`)
        .send({ pin: '123456' });

      // Now attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login-pin')
          .send({
            phoneNumber: testPhoneNumber,
            pin: 'wrong-pin'
          });
      }

      // Next attempt should be locked
      const lockedResponse = await request(app)
        .post('/api/v1/auth/login-pin')
        .send({
          phoneNumber: testPhoneNumber,
          pin: 'wrong-pin'
        });

      expect(lockedResponse.status).toBe(423); // Locked
      expect(lockedResponse.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('should validate input properly', async () => {
      // Test invalid phone number
      const invalidPhoneResponse = await request(app)
        .post('/api/v1/auth/send-otp')
        .send({ phoneNumber: 'invalid-phone' });

      expect(invalidPhoneResponse.status).toBe(400);

      // Test weak PIN
      const weakPinResponse = await request(app)
        .post('/api/v1/auth/set-pin')
        .set('Authorization', 'Bearer fake-token')
        .send({ pin: '123' }); // Too short

      expect(weakPinResponse.status).toBe(400);
    });
  });
});