import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  createLoanApplication,
  getCustomerApplications,
  getApplicationDetails,
  updateApplicationStatus,
  getActiveLoans,
  calculateLoanEligibility,
  getLoanStatistics,
  getLoanDetails,
  generateLoanStatement
} from '../controllers/loanController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Create loan application
router.post('/applications',
  [
    body('loanAmount')
      .isFloat({ min: 1000, max: 10000000 })
      .withMessage('Loan amount must be between ₹1,000 and ₹1,00,00,000'),
    body('loanPurpose')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Loan purpose must be between 3 and 200 characters'),
    body('goldItems')
      .isArray({ min: 1 })
      .withMessage('At least one gold item is required'),
    body('goldItems.*.type')
      .trim()
      .notEmpty()
      .withMessage('Gold type is required'),
    body('goldItems.*.weight')
      .isFloat({ min: 0.1 })
      .withMessage('Gold weight must be at least 0.1 grams'),
    body('goldItems.*.purity')
      .isFloat({ min: 10, max: 24 })
      .withMessage('Gold purity must be between 10 and 24 karats'),
    body('goldTotalWeight')
      .isFloat({ min: 0.1 })
      .withMessage('Total gold weight is required'),
    body('goldTotalValue')
      .isFloat({ min: 100 })
      .withMessage('Total gold value is required'),
    body('customerLocation.address')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Address must be between 10 and 500 characters'),
    body('preferredVisitDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid visit date format'),
    body('loanTenureMonths')
      .optional()
      .isInt({ min: 3, max: 60 })
      .withMessage('Loan tenure must be between 3 and 60 months')
  ],
  validateRequest,
  createLoanApplication
);

// Get customer applications
router.get('/applications',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('status')
      .optional()
      .isIn(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .withMessage('Invalid status')
  ],
  validateRequest,
  getCustomerApplications
);

// Get application details
router.get('/applications/:applicationId',
  [
    param('applicationId')
      .trim()
      .notEmpty()
      .withMessage('Application ID is required')
  ],
  validateRequest,
  getApplicationDetails
);

// Update application status (employees/admin only)
router.patch('/applications/:applicationId/status',
  [
    param('applicationId')
      .trim()
      .notEmpty()
      .withMessage('Application ID is required'),
    body('status')
      .isIn(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])
      .withMessage('Invalid status'),
    body('remarks')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Remarks must not exceed 1000 characters'),
    body('assignedEmployee')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Assigned employee ID cannot be empty')
  ],
  validateRequest,
  updateApplicationStatus
);

// Get active loans
router.get('/active',
  getActiveLoans
);

// Calculate loan eligibility
router.post('/calculate-eligibility',
  [
    body('goldWeight')
      .isFloat({ min: 0.1 })
      .withMessage('Gold weight must be at least 0.1 grams'),
    body('goldPurity')
      .isFloat({ min: 10, max: 24 })
      .withMessage('Gold purity must be between 10 and 24 karats'),
    body('goldType')
      .optional()
      .trim()
      .isIn(['GOLD_COINS', 'GOLD_BARS', 'JEWELRY', 'ORNAMENTS'])
      .withMessage('Invalid gold type'),
    body('currentGoldRate')
      .isFloat({ min: 1000 })
      .withMessage('Current gold rate is required')
  ],
  validateRequest,
  calculateLoanEligibility
);

// Get loan statistics (admin/employee only)
router.get('/statistics',
  getLoanStatistics
);

// Get detailed loan information by loan ID
router.get('/:loanId/details',
  [
    param('loanId')
      .trim()
      .notEmpty()
      .withMessage('Loan ID is required')
  ],
  validateRequest,
  getLoanDetails
);

// Generate loan statement
router.get('/:loanId/statement',
  [
    param('loanId')
      .trim()
      .notEmpty()
      .withMessage('Loan ID is required'),
    query('fromDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid from date format'),
    query('toDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid to date format')
  ],
  validateRequest,
  generateLoanStatement
);

export default router;