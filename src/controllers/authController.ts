import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { JWTService } from '../utils/jwt';
import { BcryptService } from '../utils/bcrypt';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin SDK handles verification directly

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  try {
    const serviceAccountPath = path.join(__dirname, '../../gpt-gold-loan-firebase-adminsdk-fbsvc-cc5648f130.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: 'gpt-gold-loan',
    });
    logger.info('Firebase Admin initialized successfully with service account file');
  } catch (error) {
    logger.error('Firebase Admin initialization failed:', error);
  }
}

export class AuthController {
  // Send OTP for phone number verification
  static async sendOTP(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber, countryCode = '+91' } = req.body;

      if (!phoneNumber) {
        throw createError('Phone number is required', 400);
      }

      // Handle both formats: +919566405278 or 9566405278
      let fullPhoneNumber = phoneNumber;
      
      if (phoneNumber.startsWith('+')) {
        // Already has country code
        fullPhoneNumber = phoneNumber;
      } else {
        // No country code, add it
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phoneNumber)) {
          throw createError('Invalid phone number format', 400);
        }
        fullPhoneNumber = `${countryCode}${phoneNumber}`;
      }

      // Validate that we have exactly 10 digits at the end
      if (!/\d{10}$/.test(fullPhoneNumber)) {
        throw createError('Invalid phone number format', 400);
      }

      // For Firebase Auth, OTP sending is handled on the client side
      // This endpoint is now optional and mainly for logging/analytics
      logger.info(`OTP initiation request for ${fullPhoneNumber}`);

      void res.status(200).json({
        success: true,
        message: 'Firebase OTP flow initialized',
        data: {
          phoneNumber: fullPhoneNumber,
          useFirebaseAuth: true,
          message: 'Proceed with Firebase OTP verification on client',
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Verify Firebase ID Token and register/login user
  static async verifyOTP(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber, idToken, firstName, lastName, userType = 'CUSTOMER' } = req.body;

      if (!phoneNumber || !idToken) {
        throw createError('Phone number and Firebase ID token are required', 400);
      }

      // Verify Firebase ID token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
        logger.info(`Firebase token verified for phone: ${phoneNumber}`);
      } catch (error) {
        logger.error('Firebase token verification failed:', error);
        throw createError('Invalid Firebase token', 400);
      }

      // Check if the phone number matches (handle different formats)
      const normalizedTokenPhone = decodedToken.phone_number?.replace(/^\+91/, '').replace(/\s+/g, '');
      const normalizedRequestPhone = phoneNumber.replace(/^\+91/, '').replace(/\s+/g, '');
      
      if (normalizedTokenPhone !== normalizedRequestPhone) {
        logger.error(`Phone number mismatch: token=${decodedToken.phone_number}, request=${phoneNumber}`);
        throw createError('Phone number verification failed', 400);
      }
      
      logger.info(`Phone number verified: ${phoneNumber}`);

      // Firebase token verification successful

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { phoneNumber },
        include: {
          employeeDetails: true,
        },
      });

      let isNewUser = false;

      // If user doesn't exist, create new user
      if (!user) {
        isNewUser = true;
        
        // For new users, we return user data without tokens if names are missing
        // This allows the frontend to collect names before proceeding
        if (!firstName || !lastName) {
          void res.status(200).json({
            success: true,
            message: 'Phone verified. Please provide your details to continue.',
            data: {
              user: {
                phoneNumber,
                isNewUser: true,
                requiresDetails: true,
              },
              tokens: null,
              isNewUser: true,
            },
          });
          return;
        }

        user = await prisma.user.create({
          data: {
            phoneNumber,
            firstName,
            lastName,
            userType: userType as any,
            status: 'ACTIVE',
          },
          include: {
            employeeDetails: true,
          },
        });

        logger.info(`New user registered: ${user.userId} (${phoneNumber})`);
      }

      // Generate JWT tokens
      const tokenPayload = {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
      };

      const tokens = JWTService.generateTokenPair(tokenPayload);

      // Update last login
      await prisma.user.update({
        where: { userId: user.userId },
        data: { 
          lastLogin: new Date(),
          loginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      void res.status(200).json({
        success: true,
        message: isNewUser ? 'User registered successfully' : 'Login successful',
        data: {
          user: {
            userId: user.userId,
            phoneNumber: user.phoneNumber,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            status: user.status,
            profilePhotoUrl: user.profilePhotoUrl,
            biometricEnabled: user.biometricEnabled,
            hasPIN: !!user.pinHash,
          },
          tokens,
          isNewUser,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Set PIN for user account
  static async setPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pin, phoneNumber, firstName, lastName, userData } = req.body;
      
      // Try to get userId from auth first, fall back to phoneNumber lookup
      let userId = req.user?.userId;
      let user = null;
      
      if (!userId && phoneNumber) {
        user = await prisma.user.findUnique({
          where: { phoneNumber },
        });
        userId = user?.userId;
      }

      // If user doesn't exist but we have required data, create the user
      if (!userId && phoneNumber && firstName) {
        user = await prisma.user.create({
          data: {
            phoneNumber,
            firstName,
            lastName: lastName || '',
            userType: 'CUSTOMER',
            status: 'ACTIVE',
          },
          include: {
            employeeDetails: true,
          },
        });
        userId = user.userId;
        logger.info(`New user created during setPin: ${userId} (${phoneNumber})`);
      }

      if (!userId) {
        throw createError('User not found. Please verify your phone number first.', 404);
      }

      if (!pin) {
        throw createError('PIN is required', 400);
      }

      // Validate PIN format
      const pinRegex = /^\d{4}$/;
      if (!pinRegex.test(pin)) {
        throw createError('PIN must be exactly 4 digits', 400);
      }

      // Hash PIN
      const pinHash = await BcryptService.hashPin(pin);

      // Prepare update data
      const updateData: any = { pinHash };
      
      // Update firstName and lastName if provided and user already existed
      if (user && firstName && user.firstName !== firstName) {
        updateData.firstName = firstName;
      }
      if (user && lastName && user.lastName !== lastName) {
        updateData.lastName = lastName;
      }

      // Update user with PIN and generate tokens
      const updatedUser = await prisma.user.update({
        where: { userId },
        data: updateData,
        include: {
          employeeDetails: true,
        },
      });

      // Generate JWT tokens for completed registration
      const tokenPayload = {
        userId: updatedUser.userId,
        phoneNumber: updatedUser.phoneNumber,
        userType: updatedUser.userType,
      };

      const tokens = JWTService.generateTokenPair(tokenPayload);

      logger.info(`PIN set for user: ${userId}`);

      void res.status(200).json({
        success: true,
        message: 'PIN set successfully',
        data: {
          user: {
            userId: updatedUser.userId,
            phoneNumber: updatedUser.phoneNumber,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            userType: updatedUser.userType,
            status: updatedUser.status,
            profilePhotoUrl: updatedUser.profilePhotoUrl,
            biometricEnabled: updatedUser.biometricEnabled,
          },
          tokens,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Login with PIN
  static async loginWithPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber, pin } = req.body;

      if (!phoneNumber || !pin) {
        throw createError('Phone number and PIN are required', 400);
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { phoneNumber },
        include: {
          employeeDetails: true,
        },
      });

      if (!user) {
        throw createError('User not found', 404);
      }

      // Check if account is locked
      if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
        throw createError('Account is temporarily locked. Please try again later', 423);
      }

      // Check if user has PIN set
      if (!user.pinHash) {
        throw createError('PIN not set. Please complete registration', 400);
      }

      // Verify PIN
      const isPinValid = await BcryptService.comparePin(pin, user.pinHash);

      if (!isPinValid) {
        // Increment login attempts
        const newAttempts = user.loginAttempts + 1;
        const updateData: any = { loginAttempts: newAttempts };

        // Lock account after 5 failed attempts
        if (newAttempts >= 5) {
          updateData.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        }

        await prisma.user.update({
          where: { userId: user.userId },
          data: updateData,
        });

        throw createError('Invalid PIN', 401);
      }

      // Generate JWT tokens
      const tokenPayload = {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
      };

      const tokens = JWTService.generateTokenPair(tokenPayload);

      // Update last login and reset attempts
      await prisma.user.update({
        where: { userId: user.userId },
        data: { 
          lastLogin: new Date(),
          loginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      void res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            userId: user.userId,
            phoneNumber: user.phoneNumber,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            status: user.status,
            profilePhotoUrl: user.profilePhotoUrl,
            biometricEnabled: user.biometricEnabled,
          },
          tokens,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Refresh access token
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw createError('Invalid refresh token', 401);
      }

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { userId },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw createError('User account is inactive', 401);
      }

      // Generate new access token
      const tokenPayload = {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        userType: user.userType,
      };

      const accessToken = JWTService.generateAccessToken(tokenPayload);

      void res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Logout (client-side token removal, but we can log it)
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (userId) {
        logger.info(`User logged out: ${userId}`);
      }

      void res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Initiate PIN reset with phone verification
  static async forgotPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        throw createError('Phone number is required', 400);
      }

      // Validate phone number format
      let normalizedPhone = phoneNumber;
      if (phoneNumber.startsWith('+91')) {
        normalizedPhone = phoneNumber.substring(3);
      }
      
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(normalizedPhone)) {
        throw createError('Invalid phone number format', 400);
      }

      // Check if user exists with this phone number
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
      });

      if (!user) {
        throw createError('No account found with this phone number', 404);
      }

      if (!user.pinHash) {
        throw createError('This account does not have a PIN set up', 400);
      }

      // Log the PIN reset attempt for security audit
      logger.info(`PIN reset initiated for user: ${user.userId} (${phoneNumber})`);

      void res.status(200).json({
        success: true,
        message: 'Please verify your phone number with OTP to reset your PIN',
        data: {
          phoneNumber: normalizedPhone,
          requiresOTPVerification: true,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Reset PIN with Firebase ID token verification
  static async resetPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber, idToken, newPin } = req.body;

      if (!phoneNumber || !idToken || !newPin) {
        throw createError('Phone number, Firebase ID token, and new PIN are required', 400);
      }

      // Validate new PIN format
      const pinRegex = /^\d{4}$/;
      if (!pinRegex.test(newPin)) {
        throw createError('PIN must be exactly 4 digits', 400);
      }

      // Verify Firebase ID token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
        logger.info(`Firebase token verified for PIN reset: ${phoneNumber}`);
      } catch (error) {
        logger.error('Firebase token verification failed for PIN reset:', error);
        throw createError('Invalid Firebase token', 400);
      }

      // Verify phone number matches token
      const normalizedTokenPhone = decodedToken.phone_number?.replace(/^\+91/, '').replace(/\s+/g, '');
      const normalizedRequestPhone = phoneNumber.replace(/^\+91/, '').replace(/\s+/g, '');
      
      if (normalizedTokenPhone !== normalizedRequestPhone) {
        logger.error(`Phone number mismatch during PIN reset: token=${decodedToken.phone_number}, request=${phoneNumber}`);
        throw createError('Phone number verification failed', 400);
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedRequestPhone },
      });

      if (!user) {
        throw createError('User not found', 404);
      }

      if (!user.pinHash) {
        throw createError('This account does not have a PIN set up', 400);
      }

      // Hash new PIN
      const newPinHash = await BcryptService.hashPin(newPin);

      // Update user's PIN and reset login attempts
      await prisma.user.update({
        where: { userId: user.userId },
        data: { 
          pinHash: newPinHash,
          loginAttempts: 0,
          accountLockedUntil: null,
        },
      });

      // Log the successful PIN reset for security audit
      logger.info(`PIN reset successful for user: ${user.userId} (${phoneNumber})`);

      void res.status(200).json({
        success: true,
        message: 'PIN reset successfully. You can now login with your new PIN.',
        data: {
          userId: user.userId,
          phoneNumber: user.phoneNumber,
          resetTimestamp: new Date().toISOString(),
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  // Get current user profile
  static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      const user = await prisma.user.findUnique({
        where: { userId },
        include: {
          employeeDetails: true,
        },
      });

      if (!user) {
        throw createError('User not found', 404);
      }

      void res.status(200).json({
        success: true,
        data: {
          userId: user.userId,
          phoneNumber: user.phoneNumber,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          status: user.status,
          profilePhotoUrl: user.profilePhotoUrl,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          addressLine1: user.addressLine1,
          addressLine2: user.addressLine2,
          city: user.city,
          state: user.state,
          postalCode: user.postalCode,
          country: user.country,
          biometricEnabled: user.biometricEnabled,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          employeeDetails: user.employeeDetails,
        },
      });
      return;
    } catch (error) {
      next(error);
    }
  }
}