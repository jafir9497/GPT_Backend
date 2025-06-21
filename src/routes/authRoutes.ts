import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { AuthMiddleware } from '../middleware/auth';
import { body } from 'express-validator';
import { validationMiddleware } from '../middleware/validation';

const router = Router();

// Validation rules
const sendOTPValidation = [
  body('phoneNumber')
    .matches(/^(\+\d{1,4})?\d{10}$/)
    .withMessage('Phone number must be 10 digits with optional country code'),
  body('countryCode')
    .optional()
    .matches(/^\+\d{1,4}$/)
    .withMessage('Invalid country code format'),
];

const verifyOTPValidation = [
  body('phoneNumber')
    .matches(/^(\+\d{1,4})?\d{10}$/)
    .withMessage('Invalid phone number format'),
  body('idToken')
    .isString()
    .withMessage('idToken must be a JWT string'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('userType')
    .optional()
    .isIn(['customer', 'employee', 'admin', 'super_admin'])
    .withMessage('Invalid user type'),
];

const setPinValidation = [
  body('pin')
    .matches(/^\d{4}$/)
    .withMessage('PIN must be exactly 4 digits'),
];

const loginWithPinValidation = [
  body('phoneNumber')
    .matches(/^\+\d{1,4}\d{10}$/)
    .withMessage('Invalid phone number format'),
  body('pin')
    .matches(/^\d{4}$/)
    .withMessage('PIN must be exactly 4 digits'),
];

const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
];

// Public routes (no authentication required)
router.post('/send-otp', sendOTPValidation, validationMiddleware, AuthController.sendOTP);
router.post('/verify-otp', verifyOTPValidation, validationMiddleware, AuthController.verifyOTP);
router.post('/set-pin', setPinValidation, validationMiddleware, AuthController.setPin);
router.post('/login', loginWithPinValidation, validationMiddleware, AuthController.loginWithPin);
router.post('/refresh-token', refreshTokenValidation, AuthMiddleware.verifyRefreshToken, validationMiddleware, AuthController.refreshToken);

// Protected routes (authentication required)
router.post('/logout', AuthMiddleware.verifyToken, AuthController.logout);
router.get('/profile', AuthMiddleware.verifyToken, AuthController.getProfile);

export default router;