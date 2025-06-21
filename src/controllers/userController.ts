import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/express';
import { BcryptService } from '../utils/bcrypt';

export class UserController {
  // Update user profile
  static updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const {
        email,
        firstName,
        lastName,
        dateOfBirth,
        gender,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country
      } = req.body;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      // Validate email if provided
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw createError('Invalid email format', 400);
        }

        // Check if email is already taken by another user
        const existingUser = await prisma.user.findFirst({
          where: {
            email,
            userId: { not: userId }
          }
        });

        if (existingUser) {
          throw createError('Email is already in use', 400);
        }
      }

      const updatedUser = await prisma.user.update({
        where: { userId },
        data: {
          ...(email && { email }),
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
          ...(gender && { gender: gender as any }),
          ...(addressLine1 !== undefined && { addressLine1 }),
          ...(addressLine2 !== undefined && { addressLine2 }),
          ...(city && { city }),
          ...(state && { state }),
          ...(postalCode && { postalCode }),
          ...(country && { country }),
        },
        include: {
          employeeDetails: true
        }
      });

      logger.info(`Profile updated for user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          userId: updatedUser.userId,
          phoneNumber: updatedUser.phoneNumber,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          userType: updatedUser.userType,
          status: updatedUser.status,
          profilePhotoUrl: updatedUser.profilePhotoUrl,
          dateOfBirth: updatedUser.dateOfBirth,
          gender: updatedUser.gender,
          addressLine1: updatedUser.addressLine1,
          addressLine2: updatedUser.addressLine2,
          city: updatedUser.city,
          state: updatedUser.state,
          postalCode: updatedUser.postalCode,
          country: updatedUser.country,
          biometricEnabled: updatedUser.biometricEnabled,
          employeeDetails: updatedUser.employeeDetails,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Change PIN
  static changePin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { currentPin, newPin } = req.body;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      if (!currentPin || !newPin) {
        throw createError('Current PIN and new PIN are required', 400);
      }

      if (currentPin === newPin) {
        throw createError('New PIN must be different from current PIN', 400);
      }

      // Get user with current PIN
      const user = await prisma.user.findUnique({
        where: { userId }
      });

      if (!user || !user.pinHash) {
        throw createError('User not found or PIN not set', 404);
      }

      // Verify current PIN
      const isPinValid = await BcryptService.comparePin(currentPin, user.pinHash);
      if (!isPinValid) {
        throw createError('Current PIN is incorrect', 401);
      }

      // Hash new PIN
      const newPinHash = await BcryptService.hashPin(newPin);

      // Update PIN
      await prisma.user.update({
        where: { userId },
        data: { pinHash: newPinHash }
      });

      logger.info(`PIN changed for user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'PIN changed successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Enable/disable biometric authentication
  static updateBiometricSetting = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { biometricEnabled } = req.body;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      if (typeof biometricEnabled !== 'boolean') {
        throw createError('biometricEnabled must be a boolean value', 400);
      }

      await prisma.user.update({
        where: { userId },
        data: { biometricEnabled }
      });

      logger.info(`Biometric setting updated for user: ${userId} - ${biometricEnabled}`);

      res.status(200).json({
        success: true,
        message: 'Biometric setting updated successfully',
        data: { biometricEnabled },
      });
    } catch (error) {
      next(error);
    }
  };

  // Upload profile photo
  static uploadProfilePhoto = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      if (!req.file) {
        throw createError('No file uploaded', 400);
      }

      // In a real application, you would upload to cloud storage
      // For now, we'll just store the local file path
      const profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;

      await prisma.user.update({
        where: { userId },
        data: { profilePhotoUrl }
      });

      logger.info(`Profile photo uploaded for user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Profile photo uploaded successfully',
        data: { profilePhotoUrl },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get user statistics (for dashboard)
  static getUserStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      if (!userId) {
        throw createError('User not authenticated', 401);
      }

      // Get active loans count
      const activeLoansCount = await prisma.activeLoan.count({
        where: {
          customerId: userId,
          loanStatus: 'ACTIVE'
        }
      });

      // Get total outstanding amount
      const activeLoans = await prisma.activeLoan.findMany({
        where: {
          customerId: userId,
          loanStatus: 'ACTIVE'
        },
        select: {
          totalOutstanding: true
        }
      });

      const totalOutstanding = activeLoans.reduce((sum, loan) => 
        sum + parseFloat(loan.totalOutstanding.toString()), 0
      );

      // Get recent payments count (last 30 days)
      const recentPaymentsCount = await prisma.payment.count({
        where: {
          loan: {
            customerId: userId
          },
          paymentDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          },
          paymentStatus: 'COMPLETED'
        }
      });

      // Get pending applications count
      const pendingApplicationsCount = await prisma.loanApplication.count({
        where: {
          customerId: userId,
          applicationStatus: {
            in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW']
          }
        }
      });

      res.status(200).json({
        success: true,
        data: {
          activeLoansCount,
          totalOutstanding,
          recentPaymentsCount,
          pendingApplicationsCount,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get all users (admin only)
  static getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 10, userType, status, search } = req.query;
      
      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      
      if (userType) {
        where.userType = userType;
      }
      
      if (status) {
        where.status = status;
      }
      
      if (search) {
        where.OR = [
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } },
          { phoneNumber: { contains: search as string } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            employeeDetails: true
          }
        }),
        prisma.user.count({ where })
      ]);

      res.status(200).json({
        success: true,
        data: {
          users: users.map(user => ({
            userId: user.userId,
            phoneNumber: user.phoneNumber,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            userType: user.userType,
            status: user.status,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt,
            employeeDetails: user.employeeDetails
          })),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Update user status (admin only)
  static updateUserStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!status || !['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
        throw createError('Valid status is required (ACTIVE, INACTIVE, SUSPENDED)', 400);
      }

      const updatedUser = await prisma.user.update({
        where: { userId },
        data: { status: status as any }
      });

      logger.info(`User status updated: ${userId} -> ${status} by ${req.user?.userId}`);

      res.status(200).json({
        success: true,
        message: 'User status updated successfully',
        data: {
          userId: updatedUser.userId,
          status: updatedUser.status
        },
      });
    } catch (error) {
      next(error);
    }
  };
}