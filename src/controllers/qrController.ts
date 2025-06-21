import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { JWTService } from '../utils/jwt';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/express';

interface LocationValidationResult {
  isValid: boolean;
  distance?: number;
  error?: string;
}

interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export class QRController {
  // Enhanced location validation with Haversine formula
  private static validateLocationProximity(
    customerLocation: string,
    employeeLocation: LocationCoordinates,
    maxDistanceKm: number = 1.0
  ): LocationValidationResult {
    try {
      // Parse customer location coordinates
      const locationParts = customerLocation.split(',');
      if (locationParts.length !== 2) {
        return {
          isValid: false,
          error: 'Invalid customer location format'
        };
      }

      const custLat = parseFloat(locationParts[0]);
      const custLng = parseFloat(locationParts[1]);
      const empLat = employeeLocation.latitude;
      const empLng = employeeLocation.longitude;

      // Validate coordinates are valid numbers
      if (isNaN(custLat) || isNaN(custLng) || isNaN(empLat) || isNaN(empLng)) {
        return {
          isValid: false,
          error: 'Invalid coordinate values'
        };
      }

      // Validate coordinates are within reasonable bounds
      if (Math.abs(custLat) > 90 || Math.abs(empLat) > 90 ||
          Math.abs(custLng) > 180 || Math.abs(empLng) > 180) {
        return {
          isValid: false,
          error: 'Coordinates out of valid range'
        };
      }

      // Calculate distance using Haversine formula
      const distance = this.calculateHaversineDistance(
        custLat, custLng, empLat, empLng
      );

      // Get configurable distance threshold (default 1km)
      const threshold = process.env.QR_LOCATION_THRESHOLD_KM 
        ? parseFloat(process.env.QR_LOCATION_THRESHOLD_KM)
        : maxDistanceKm;

      const isValid = distance <= threshold;

      return {
        isValid,
        distance,
        error: isValid ? undefined : `Distance ${distance.toFixed(2)}km exceeds threshold ${threshold}km`
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Location validation error: ${error}`
      };
    }
  }

  // Calculate accurate distance using Haversine formula
  private static calculateHaversineDistance(
    lat1: number, lng1: number, lat2: number, lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  // Convert degrees to radians
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  // Generate QR code for customer verification
  static generateQR = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customerId = req.user!.userId;
      const { location, purpose = 'verification' } = req.body;

      if (!customerId) {
        throw createError('Customer authentication required', 401);
      }

      // Validate customer exists and is active
      const customer = await prisma.user.findUnique({
        where: { 
          userId: customerId,
          userType: 'CUSTOMER',
          status: 'ACTIVE'
        }
      });

      if (!customer) {
        throw createError('Customer not found or inactive', 404);
      }

      // Invalidate any existing active QR sessions for this customer
      await prisma.qRAuthentication.updateMany({
        where: {
          customerId,
          sessionStatus: 'ACTIVE'
        },
        data: {
          sessionStatus: 'EXPIRED'
        }
      });

      // Generate QR token with location and customer info
      const qrPayload = {
        customerId,
        purpose,
        location: location ? `${location.latitude},${location.longitude}` : undefined,
        timestamp: Date.now()
      };

      const qrToken = JWTService.generateQRToken({
        customerId: qrPayload.customerId,
        location: qrPayload.location
      });
      const expiresAt = new Date(Date.now() + 30 * 1000); // 30 seconds

      // Store QR session in database
      const qrSession = await prisma.qRAuthentication.create({
        data: {
          customerId,
          qrToken,
          expiresAt,
          location: qrPayload.location || null,
          sessionStatus: 'ACTIVE'
        }
      });

      logger.info(`QR code generated for customer: ${customerId}`);

      res.status(200).json({
        success: true,
        message: 'QR code generated successfully',
        data: {
          qrSessionId: qrSession.qrSessionId,
          qrToken,
          expiresAt,
          expiresIn: 30, // seconds
          location: qrPayload.location || null,
          customerInfo: {
            name: `${customer.firstName} ${customer.lastName}`,
            phoneNumber: customer.phoneNumber
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Verify QR code by employee/field agent
  static verifyQR = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const employeeId = req.user!.userId;
      const { qrToken, employeeLocation, visitPurpose, notes } = req.body;

      if (!employeeId) {
        throw createError('Employee authentication required', 401);
      }

      if (!qrToken) {
        throw createError('QR token is required', 400);
      }

      // Validate employee exists and has appropriate role
      const employee = await prisma.user.findUnique({
        where: { 
          userId: employeeId,
          userType: { in: ['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'] },
          status: 'ACTIVE'
        },
        include: {
          employeeDetails: true
        }
      });

      if (!employee) {
        throw createError('Employee not found or unauthorized', 404);
      }

      // Verify QR token
      let qrPayload;
      try {
        qrPayload = JWTService.verifyQRToken(qrToken);
      } catch (jwtError) {
        throw createError('Invalid or expired QR code', 401);
      }

      // Find and validate QR session
      const qrSession = await prisma.qRAuthentication.findFirst({
        where: {
          qrToken,
          sessionStatus: 'ACTIVE'
        },
        include: {
          customer: true
        }
      });

      if (!qrSession) {
        throw createError('QR session not found or already used', 404);
      }

      // Check if QR code has expired
      if (new Date() > qrSession.expiresAt) {
        await prisma.qRAuthentication.update({
          where: { qrSessionId: qrSession.qrSessionId },
          data: { sessionStatus: 'EXPIRED' }
        });
        throw createError('QR code has expired', 401);
      }

      // Validate location proximity (if location was provided)
      if (qrSession.location && employeeLocation) {
        const locationValidation = this.validateLocationProximity(
          qrSession.location,
          employeeLocation
        );
        
        if (!locationValidation.isValid) {
          throw createError(
            `Location verification failed: ${locationValidation.error}`,
            403
          );
        }
      }

      // Mark QR session as used
      const updatedQRSession = await prisma.qRAuthentication.update({
        where: { qrSessionId: qrSession.qrSessionId },
        data: {
          sessionStatus: 'USED',
          employeeId,
          usedAt: new Date()
        },
        include: {
          customer: true,
          employee: true
        }
      });

      // Log audit trail
      await prisma.auditLog.create({
        data: {
          userId: employeeId,
          tableName: 'qr_authentication',
          recordId: qrSession.qrSessionId,
          action: 'UPDATE',
          newValues: {
            action: 'QR_VERIFIED',
            employeeId,
            customerId: qrSession.customerId,
            visitPurpose,
            notes,
            location: employeeLocation ? `${employeeLocation.latitude},${employeeLocation.longitude}` : null
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      logger.info(`QR verified successfully - Employee: ${employeeId}, Customer: ${qrSession.customerId}`);

      res.status(200).json({
        success: true,
        message: 'QR code verified successfully',
        data: {
          qrSessionId: updatedQRSession.qrSessionId,
          customer: {
            userId: updatedQRSession.customer.userId,
            name: `${updatedQRSession.customer.firstName} ${updatedQRSession.customer.lastName}`,
            phoneNumber: updatedQRSession.customer.phoneNumber,
            email: updatedQRSession.customer.email,
            profilePhotoUrl: updatedQRSession.customer.profilePhotoUrl
          },
          employee: {
            userId: updatedQRSession.employee!.userId,
            name: `${updatedQRSession.employee!.firstName} ${updatedQRSession.employee!.lastName}`,
            employeeId: (updatedQRSession.employee as any)?.employeeDetails?.employeeId
          },
          verificationTime: updatedQRSession.usedAt,
          visitPurpose,
          notes
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Get QR session details
  static getQRSession = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qrSessionId } = req.params;
      const userId = req.user!.userId;

      if (!userId) {
        throw createError('Authentication required', 401);
      }

      const qrSession = await prisma.qRAuthentication.findUnique({
        where: { qrSessionId },
        include: {
          customer: true,
          employee: true
        }
      });

      if (!qrSession) {
        throw createError('QR session not found', 404);
      }

      // Check if user has access to this QR session
      const hasAccess = qrSession.customerId === userId || 
                       qrSession.employeeId === userId ||
                       req.user!.userType === 'ADMIN' ||
                       req.user!.userType === 'SUPER_ADMIN';

      if (!hasAccess) {
        throw createError('Access denied', 403);
      }

      res.status(200).json({
        success: true,
        data: {
          qrSessionId: qrSession.qrSessionId,
          status: qrSession.sessionStatus,
          createdAt: qrSession.createdAt,
          expiresAt: qrSession.expiresAt,
          usedAt: qrSession.usedAt,
          location: qrSession.location,
          customer: {
            userId: qrSession.customer.userId,
            name: `${qrSession.customer.firstName} ${qrSession.customer.lastName}`,
            phoneNumber: qrSession.customer.phoneNumber
          },
          employee: qrSession.employee ? {
            userId: qrSession.employee.userId,
            name: `${qrSession.employee.firstName} ${qrSession.employee.lastName}`,
            employeeId: (qrSession.employee as any)?.employeeDetails?.employeeId
          } : null
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Get QR session history for a user
  static getQRHistory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { page = 1, limit = 10, status } = req.query;

      if (!userId) {
        throw createError('Authentication required', 401);
      }

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {};

      // Filter based on user type
      if (req.user!.userType === 'CUSTOMER') {
        where.customerId = userId;
      } else if (['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'].includes(req.user!.userType)) {
        if (req.user!.userType === 'EMPLOYEE') {
          where.employeeId = userId;
        }
        // Admin and Super Admin can see all records (no additional filter)
      }

      if (status) {
        where.sessionStatus = status;
      }

      const [qrSessions, total] = await Promise.all([
        prisma.qRAuthentication.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            customer: true,
            employee: true
          }
        }),
        prisma.qRAuthentication.count({ where })
      ]);

      res.status(200).json({
        success: true,
        data: {
          qrSessions: qrSessions.map(session => ({
            qrSessionId: session.qrSessionId,
            status: session.sessionStatus,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            usedAt: session.usedAt,
            location: session.location,
            customer: {
              userId: session.customer.userId,
              name: `${session.customer.firstName} ${session.customer.lastName}`,
              phoneNumber: session.customer.phoneNumber
            },
            employee: session.employee ? {
              userId: session.employee.userId,
              name: `${session.employee.firstName} ${session.employee.lastName}`,
              employeeId: (session.employee as any)?.employeeDetails?.employeeId
            } : null
          })),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  // Revoke active QR codes (emergency/security)
  static revokeQR = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qrSessionId } = req.params;
      const userId = req.user!.userId;

      if (!userId) {
        throw createError('Authentication required', 401);
      }

      const qrSession = await prisma.qRAuthentication.findUnique({
        where: { qrSessionId }
      });

      if (!qrSession) {
        throw createError('QR session not found', 404);
      }

      // Check if user can revoke this QR (customer who created it or admin)
      const canRevoke = qrSession.customerId === userId ||
                       req.user!.userType === 'ADMIN' ||
                       req.user!.userType === 'SUPER_ADMIN';

      if (!canRevoke) {
        throw createError('Access denied', 403);
      }

      if (qrSession.sessionStatus !== 'ACTIVE') {
        throw createError('QR session is not active', 400);
      }

      await prisma.qRAuthentication.update({
        where: { qrSessionId },
        data: { sessionStatus: 'REVOKED' }
      });

      logger.info(`QR session revoked: ${qrSessionId} by user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'QR session revoked successfully'
      });
    } catch (error) {
      next(error);
    }
  };
}