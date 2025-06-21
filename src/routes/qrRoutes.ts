import { Router } from 'express';
import { QRController } from '../controllers/qrController';
import { AuthMiddleware } from '../middleware/auth';
import { body, param, query } from 'express-validator';
import { validationMiddleware } from '../middleware/validation';

const router = Router();

// Validation rules
const generateQRValidation = [
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('purpose')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Purpose must be between 1 and 100 characters'),
];

const verifyQRValidation = [
  body('qrToken')
    .notEmpty()
    .withMessage('QR token is required'),
  body('employeeLocation')
    .optional()
    .isObject()
    .withMessage('Employee location must be an object'),
  body('employeeLocation.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('employeeLocation.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('visitPurpose')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Visit purpose must be between 1 and 200 characters'),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
];

const qrSessionValidation = [
  param('qrSessionId')
    .isUUID()
    .withMessage('Invalid QR session ID format'),
];

const qrHistoryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['ACTIVE', 'USED', 'EXPIRED', 'REVOKED'])
    .withMessage('Invalid status value'),
];

// Apply authentication to all routes
router.use(AuthMiddleware.verifyToken);

// QR generation routes (Customer only)
router.post(
  '/generate',
  AuthMiddleware.requireCustomer,
  generateQRValidation,
  validationMiddleware,
  QRController.generateQR
);

// QR verification routes (Employee/Admin only)
router.post(
  '/verify',
  AuthMiddleware.requireEmployee,
  verifyQRValidation,
  validationMiddleware,
  QRController.verifyQR
);

// QR session management routes
router.get(
  '/session/:qrSessionId',
  qrSessionValidation,
  validationMiddleware,
  QRController.getQRSession
);

router.get(
  '/history',
  qrHistoryValidation,
  validationMiddleware,
  QRController.getQRHistory
);

router.post(
  '/revoke/:qrSessionId',
  qrSessionValidation,
  validationMiddleware,
  QRController.revokeQR
);

export default router;