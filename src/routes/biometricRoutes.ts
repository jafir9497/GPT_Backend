import express from 'express';
import { body, query, param } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import { authenticateBiometric, requireBiometric } from '../middleware/biometricAuth';
import {
  registerBiometric,
  updateBiometric,
  deleteBiometric,
  getBiometricStatus,
  verifyBiometric,
  getBiometricLogs
} from '../controllers/biometricController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Register biometric data
router.post('/register',
  [
    body('biometricTemplate')
      .notEmpty()
      .withMessage('Biometric template is required')
      .isLength({ min: 50 })
      .withMessage('Biometric template must be at least 50 characters'),
    body('biometricType')
      .optional()
      .isIn(['fingerprint', 'face', 'voice', 'iris'])
      .withMessage('Invalid biometric type'),
    body('deviceId')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Device ID must be between 1 and 100 characters'),
    body('deviceInfo')
      .optional()
      .isObject()
      .withMessage('Device info must be an object')
  ],
  validateRequest,
  registerBiometric
);

// Update biometric data
router.put('/update',
  [
    body('biometricTemplate')
      .notEmpty()
      .withMessage('Biometric template is required')
      .isLength({ min: 50 })
      .withMessage('Biometric template must be at least 50 characters'),
    body('biometricType')
      .optional()
      .isIn(['fingerprint', 'face', 'voice', 'iris'])
      .withMessage('Invalid biometric type'),
    body('deviceId')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Device ID must be between 1 and 100 characters'),
    body('deviceInfo')
      .optional()
      .isObject()
      .withMessage('Device info must be an object')
  ],
  validateRequest,
  updateBiometric
);

// Delete biometric data
router.delete('/delete',
  deleteBiometric
);

// Get biometric status
router.get('/status',
  getBiometricStatus
);

// Verify biometric for sensitive operations
router.post('/verify',
  [
    body('biometricTemplate')
      .notEmpty()
      .withMessage('Biometric template is required')
      .isLength({ min: 50 })
      .withMessage('Biometric template must be at least 50 characters'),
    body('operation')
      .trim()
      .notEmpty()
      .withMessage('Operation is required')
      .isIn([
        'payment_collection',
        'loan_approval',
        'document_access',
        'user_management',
        'sensitive_data_access'
      ])
      .withMessage('Invalid operation type'),
    body('operationData')
      .optional()
      .isObject()
      .withMessage('Operation data must be an object')
  ],
  validateRequest,
  verifyBiometric
);

// Biometric authentication endpoint
router.post('/authenticate',
  [
    body('deviceId')
      .trim()
      .notEmpty()
      .withMessage('Device ID is required'),
    body('biometricTemplate')
      .notEmpty()
      .withMessage('Biometric template is required')
      .isLength({ min: 50 })
      .withMessage('Biometric template must be at least 50 characters'),
    body('timestamp')
      .isISO8601()
      .withMessage('Valid timestamp is required'),
    body('location')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Location must not exceed 200 characters')
  ],
  validateRequest,
  authenticateBiometric,
  (req: express.Request, res: express.Response) => {
    res.json({
      success: true,
      data: {
        userId: req.user!.userId,
        authenticated: true,
        timestamp: new Date().toISOString(),
        message: 'Biometric authentication successful'
      }
    });
  }
);

// Get biometric logs (admin only)
router.get('/logs',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('userId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('User ID cannot be empty'),
    query('success')
      .optional()
      .isBoolean()
      .withMessage('Success must be boolean'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
  ],
  validateRequest,
  getBiometricLogs
);

// Protected route example that requires biometric
router.get('/secure-data',
  requireBiometric,
  (req: express.Request, res: express.Response) => {
    res.json({
      success: true,
      data: {
        message: 'Access granted to secure data',
        biometricVerified: true,
        accessTime: new Date().toISOString()
      }
    });
  }
);

export default router;