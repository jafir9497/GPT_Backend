import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { AuthRequest } from '../types/express';

const prisma = new PrismaClient();

// Register biometric data
export const registerBiometric = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      biometricTemplate,
      biometricType = 'fingerprint',
      deviceId,
      deviceInfo
    } = req.body;

    const userId = req.user!.userId;

    if (!biometricTemplate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Biometric template is required'
        }
      });
      return;
    }

    // Check if user already has biometric data
    const existingBiometric = await prisma.biometricData.findUnique({
      where: { userId }
    });

    if (existingBiometric) {
      res.status(400).json({
        success: false,
        error: {
          code: 'BIOMETRIC_EXISTS',
          message: 'Biometric data already registered. Please update instead.'
        }
      });
      return;
    }

    // Encrypt biometric template for storage
    const encryptedTemplate = encryptBiometricData(biometricTemplate);

    // Store biometric data
    const biometricData = await prisma.biometricData.create({
      data: {
        userId,
        template: encryptedTemplate,
        biometricType,
        deviceId,
        deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : null,
        isActive: true
      }
    });

    // Enable biometric for user
    await prisma.user.update({
      where: { userId },
      data: { biometricEnabled: true }
    });

    // Update employee device if applicable
    if (req.user!.userType === 'EMPLOYEE' && deviceId) {
      await prisma.employeeDetail.updateMany({
        where: { userId },
        data: { deviceId }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        biometricId: biometricData.biometricId,
        biometricType: biometricData.biometricType,
        registeredAt: biometricData.createdAt,
        message: 'Biometric data registered successfully'
      }
    });

  } catch (error) {
    logger.error('Register biometric error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to register biometric data'
      }
    });
  }
};

// Update biometric data
export const updateBiometric = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      biometricTemplate,
      biometricType,
      deviceId,
      deviceInfo
    } = req.body;

    const userId = req.user!.userId;

    if (!biometricTemplate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Biometric template is required'
        }
      });
      return;
    }

    // Check if biometric data exists
    const existingBiometric = await prisma.biometricData.findUnique({
      where: { userId }
    });

    if (!existingBiometric) {
      res.status(404).json({
        success: false,
        error: {
          code: 'BIOMETRIC_NOT_FOUND',
          message: 'No biometric data found. Please register first.'
        }
      });
      return;
    }

    // Encrypt new biometric template
    const encryptedTemplate = encryptBiometricData(biometricTemplate);

    // Update biometric data
    const updatedBiometric = await prisma.biometricData.update({
      where: { userId },
      data: {
        template: encryptedTemplate,
        biometricType: biometricType || existingBiometric.biometricType,
        deviceId: deviceId || existingBiometric.deviceId,
        deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : existingBiometric.deviceInfo,
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        biometricId: updatedBiometric.biometricId,
        biometricType: updatedBiometric.biometricType,
        updatedAt: updatedBiometric.updatedAt,
        message: 'Biometric data updated successfully'
      }
    });

  } catch (error) {
    logger.error('Update biometric error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update biometric data'
      }
    });
  }
};

// Delete biometric data
export const deleteBiometric = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Check if biometric data exists
    const existingBiometric = await prisma.biometricData.findUnique({
      where: { userId }
    });

    if (!existingBiometric) {
      res.status(404).json({
        success: false,
        error: {
          code: 'BIOMETRIC_NOT_FOUND',
          message: 'No biometric data found'
        }
      });
      return;
    }

    // Delete biometric data
    await prisma.biometricData.delete({
      where: { userId }
    });

    // Disable biometric for user
    await prisma.user.update({
      where: { userId },
      data: { biometricEnabled: false }
    });

    res.json({
      success: true,
      data: {
        message: 'Biometric data deleted successfully'
      }
    });

  } catch (error) {
    logger.error('Delete biometric error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete biometric data'
      }
    });
  }
};

// Get biometric status
export const getBiometricStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        biometricData: {
          select: {
            biometricId: true,
            biometricType: true,
            deviceId: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        biometricEnabled: user.biometricEnabled,
        biometricData: user.biometricData,
        supportedTypes: ['fingerprint', 'face', 'voice'] // Available biometric types
      }
    });

  } catch (error) {
    logger.error('Get biometric status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve biometric status'
      }
    });
  }
};

// Verify biometric for sensitive operations
export const verifyBiometric = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      biometricTemplate,
      operation,
      operationData
    } = req.body;

    const userId = req.user!.userId;

    if (!biometricTemplate || !operation) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Biometric template and operation are required'
        }
      });
      return;
    }

    // Get stored biometric data
    const biometricData = await prisma.biometricData.findUnique({
      where: { userId }
    });

    if (!biometricData || !biometricData.isActive) {
      res.status(404).json({
        success: false,
        error: {
          code: 'BIOMETRIC_NOT_FOUND',
          message: 'No active biometric data found'
        }
      });
      return;
    }

    // Decrypt and verify biometric template
    const storedTemplate = decryptBiometricData(biometricData.template);
    const isValid = await verifyBiometricTemplate(biometricTemplate, storedTemplate);

    if (!isValid) {
      // Log failed verification attempt
      await logBiometricVerification(userId, operation, false);
      
      res.status(401).json({
        success: false,
        error: {
          code: 'BIOMETRIC_VERIFICATION_FAILED',
          message: 'Biometric verification failed'
        }
      });
      return;
    }

    // Log successful verification
    await logBiometricVerification(userId, operation, true, operationData);

    // Generate verification token for the operation
    const verificationToken = generateVerificationToken(userId, operation);

    res.json({
      success: true,
      data: {
        verified: true,
        verificationToken,
        expiresIn: 300, // 5 minutes
        message: 'Biometric verification successful'
      }
    });

  } catch (error) {
    logger.error('Verify biometric error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to verify biometric'
      }
    });
  }
};

// Get biometric logs (admin only)
export const getBiometricLogs = async (req: AuthRequest, res: Response): Promise<void> => {
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
      page = 1,
      limit = 20,
      userId,
      success,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const whereClause: any = {};

    if (userId) {
      whereClause.userId = userId;
    }

    if (success !== undefined) {
      whereClause.success = success === 'true';
    }

    if (startDate || endDate) {
      whereClause.attemptedAt = {};
      if (startDate) {
        whereClause.attemptedAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.attemptedAt.lte = new Date(endDate as string);
      }
    }

    const logs = await prisma.biometricLog.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { attemptedAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            userType: true
          }
        }
      }
    });

    const total = await prisma.biometricLog.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    logger.error('Get biometric logs error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve biometric logs'
      }
    });
  }
};

// Utility functions

function encryptBiometricData(data: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.BIOMETRIC_ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(12);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptBiometricData(encryptedData: string): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.BIOMETRIC_ENCRYPTION_KEY || 'default-key', 'salt', 32);
  
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

async function verifyBiometricTemplate(provided: string, stored: string): Promise<boolean> {
  // Simple similarity check for demo
  // In production, use proper biometric matching algorithms
  const similarity = calculateSimilarity(provided, stored);
  return similarity >= 0.85;
}

function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  
  const minLength = Math.min(str1.length, str2.length);
  let matches = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (str1[i] === str2[i]) matches++;
  }
  
  return matches / Math.max(str1.length, str2.length);
}

async function logBiometricVerification(
  userId: string,
  operation: string,
  success: boolean,
  operationData?: any
): Promise<void> {
  try {
    await prisma.biometricVerification.create({
      data: {
        userId,
        operation,
        success,
        operationData: operationData ? JSON.stringify(operationData) : null,
        verifiedAt: new Date()
      }
    });
  } catch (error) {
    logger.error('Error logging biometric verification:', error);
  }
}

function generateVerificationToken(userId: string, operation: string): string {
  const payload = {
    userId,
    operation,
    timestamp: Date.now()
  };
  
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}