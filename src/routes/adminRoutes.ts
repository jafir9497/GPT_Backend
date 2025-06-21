import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  getDashboardOverview,
  getAllApplications,
  getAllActiveLoans,
  getAllUsers,
  updateApplicationStatus,
  updateUserStatus,
  getSystemAnalytics,
  createEmployee
} from '../controllers/adminController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get dashboard overview
router.get('/dashboard/overview',
  getDashboardOverview
);

// Get all loan applications with filters
router.get('/applications',
  [
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
      .isIn(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .withMessage('Invalid application status'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
    query('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min amount must be a positive number'),
    query('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max amount must be a positive number'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'requestedAmount', 'applicationStatus', 'applicationNumber'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  validateRequest,
  getAllApplications
);

// Get all active loans with filters
router.get('/loans',
  [
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
      .isIn(['ACTIVE', 'CLOSED', 'DEFAULTED', 'FORECLOSED'])
      .withMessage('Invalid loan status'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters'),
    query('overdue')
      .optional()
      .isBoolean()
      .withMessage('Overdue must be boolean'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'principalAmount', 'totalOutstanding', 'loanStatus', 'nextDueDate'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  validateRequest,
  getAllActiveLoans
);

// Get all users with filters
router.get('/users',
  [
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
      .isIn(['CUSTOMER', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'])
      .withMessage('Invalid user type'),
    query('status')
      .optional()
      .isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
      .withMessage('Invalid user status'),
    query('search')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1 and 100 characters'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'firstName', 'lastName', 'userType', 'status', 'lastLogin'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],
  validateRequest,
  getAllUsers
);

// Update application status
router.patch('/applications/:applicationId/status',
  [
    param('applicationId')
      .trim()
      .notEmpty()
      .withMessage('Application ID is required'),
    body('status')
      .isIn(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .withMessage('Invalid application status'),
    body('remarks')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Remarks must not exceed 1000 characters'),
    body('assignedFieldAgent')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Assigned field agent ID cannot be empty')
  ],
  validateRequest,
  updateApplicationStatus
);

// Update user status
router.patch('/users/:userId/status',
  [
    param('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required'),
    body('status')
      .isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
      .withMessage('Invalid user status'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must not exceed 500 characters')
  ],
  validateRequest,
  updateUserStatus
);

// Get system analytics
router.get('/analytics',
  [
    query('period')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Period must be between 1 and 365 days')
  ],
  validateRequest,
  getSystemAnalytics
);

// Create employee account
router.post('/employees',
  [
    body('phoneNumber')
      .isMobilePhone('en-IN')
      .withMessage('Valid Indian phone number is required'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Valid email is required'),
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('department')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Department must be between 2 and 100 characters'),
    body('designation')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Designation must be between 2 and 100 characters'),
    body('reportingManagerId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Reporting manager ID cannot be empty')
  ],
  validateRequest,
  createEmployee
);

export default router;