import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { AuthMiddleware } from '../middleware/auth';
import { body, param, query } from 'express-validator';
import { validationMiddleware } from '../middleware/validation';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profiles/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation rules
const updateProfileValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email format'),
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
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('gender')
    .optional()
    .isIn(['MALE', 'FEMALE', 'OTHER'])
    .withMessage('Gender must be MALE, FEMALE, or OTHER'),
  body('postalCode')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be 6 digits'),
];

const changePinValidation = [
  body('currentPin')
    .matches(/^\d{4}$/)
    .withMessage('Current PIN must be exactly 4 digits'),
  body('newPin')
    .matches(/^\d{4}$/)
    .withMessage('New PIN must be exactly 4 digits'),
];

const biometricValidation = [
  body('biometricEnabled')
    .isBoolean()
    .withMessage('biometricEnabled must be a boolean value'),
];

const userStatusValidation = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required'),
  body('status')
    .isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
    .withMessage('Status must be ACTIVE, INACTIVE, or SUSPENDED'),
];

const getUsersValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('userType')
    .optional()
    .isIn(['customer', 'employee', 'admin', 'super_admin'])
    .withMessage('Invalid user type'),
  query('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
    .withMessage('Invalid status'),
];

// Protected routes - require authentication
router.use(AuthMiddleware.verifyToken);

// User profile management
router.put('/profile', updateProfileValidation, validationMiddleware, UserController.updateProfile);
router.post('/change-pin', changePinValidation, validationMiddleware, UserController.changePin);
router.put('/biometric', biometricValidation, validationMiddleware, UserController.updateBiometricSetting);
router.post('/upload-photo', upload.single('photo'), UserController.uploadProfilePhoto);
router.get('/stats', UserController.getUserStats);

// Admin-only routes
router.get('/all', AuthMiddleware.requireAdmin, getUsersValidation, validationMiddleware, UserController.getAllUsers);
router.put('/:userId/status', AuthMiddleware.requireAdmin, userStatusValidation, validationMiddleware, UserController.updateUserStatus);

export default router;