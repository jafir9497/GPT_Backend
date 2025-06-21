import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  upload,
  uploadDocument,
  getEntityDocuments,
  getDocumentDetails,
  downloadDocument,
  generateLoanAgreement,
  generatePaymentReceipt,
  generateLoanStatement,
  generateBusinessReport,
  deleteDocument,
  getDocumentTemplates,
  generateGenericDocument
} from '../controllers/documentController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Upload document
router.post('/upload',
  upload.single('document'),
  [
    body('documentName')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Document name must be between 1 and 200 characters'),
    body('documentCategory')
      .isIn(['IDENTITY_PROOF', 'ADDRESS_PROOF', 'INCOME_PROOF', 'GOLD_DOCUMENTATION', 'LOAN_DOCUMENTATION', 'PAYMENT_DOCUMENTATION', 'GENERATED', 'OTHER'])
      .withMessage('Invalid document category'),
    body('documentType')
      .optional()
      .isIn(['UPLOADED', 'GENERATED', 'SCANNED', 'DIGITAL_SIGNATURE'])
      .withMessage('Invalid document type'),
    body('relatedEntityType')
      .trim()
      .notEmpty()
      .withMessage('Related entity type is required'),
    body('relatedEntityId')
      .trim()
      .notEmpty()
      .withMessage('Related entity ID is required'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('isRequired')
      .optional()
      .isBoolean()
      .withMessage('isRequired must be boolean'),
    body('expiryDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid expiry date format')
  ],
  validateRequest,
  uploadDocument
);

// Get documents for an entity
router.get('/entity/:entityType/:entityId',
  [
    param('entityType')
      .trim()
      .notEmpty()
      .withMessage('Entity type is required'),
    param('entityId')
      .trim()
      .notEmpty()
      .withMessage('Entity ID is required'),
    query('category')
      .optional()
      .isIn(['IDENTITY_PROOF', 'ADDRESS_PROOF', 'INCOME_PROOF', 'GOLD_DOCUMENTATION', 'LOAN_DOCUMENTATION', 'PAYMENT_DOCUMENTATION', 'GENERATED', 'OTHER'])
      .withMessage('Invalid document category'),
    query('type')
      .optional()
      .isIn(['UPLOADED', 'GENERATED', 'SCANNED', 'DIGITAL_SIGNATURE'])
      .withMessage('Invalid document type'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  validateRequest,
  getEntityDocuments
);

// Get document details
router.get('/:documentId',
  [
    param('documentId')
      .trim()
      .notEmpty()
      .withMessage('Document ID is required')
  ],
  validateRequest,
  getDocumentDetails
);

// Download document
router.get('/:documentId/download',
  [
    param('documentId')
      .trim()
      .notEmpty()
      .withMessage('Document ID is required')
  ],
  validateRequest,
  downloadDocument
);

// Generate loan agreement PDF
router.post('/generate/loan-agreement',
  [
    body('loanId').trim().notEmpty().withMessage('Loan ID is required'),
    body('customerId').trim().notEmpty().withMessage('Customer ID is required'),
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('customerPhone').trim().notEmpty().withMessage('Customer phone is required'),
    body('customerAddress').trim().notEmpty().withMessage('Customer address is required'),
    body('loanAmount').isNumeric().withMessage('Loan amount must be numeric'),
    body('interestRate').isNumeric().withMessage('Interest rate must be numeric'),
    body('tenure').isInt({ min: 1 }).withMessage('Tenure must be a positive integer'),
    body('goldWeight').isNumeric().withMessage('Gold weight must be numeric'),
    body('goldPurity').isNumeric().withMessage('Gold purity must be numeric'),
    body('goldValue').isNumeric().withMessage('Gold value must be numeric'),
    body('startDate').isISO8601().withMessage('Start date must be valid'),
    body('processingFee').isNumeric().withMessage('Processing fee must be numeric'),
    body('terms').optional().isArray().withMessage('Terms must be an array')
  ],
  validateRequest,
  generateLoanAgreement
);

// Generate payment receipt PDF
router.post('/generate/payment-receipt',
  [
    body('receiptNumber').trim().notEmpty().withMessage('Receipt number is required'),
    body('paymentId').trim().notEmpty().withMessage('Payment ID is required'),
    body('loanId').trim().notEmpty().withMessage('Loan ID is required'),
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('paymentAmount').isNumeric().withMessage('Payment amount must be numeric'),
    body('paymentDate').isISO8601().withMessage('Payment date must be valid'),
    body('paymentMethod').trim().notEmpty().withMessage('Payment method is required'),
    body('principalAmount').isNumeric().withMessage('Principal amount must be numeric'),
    body('interestAmount').isNumeric().withMessage('Interest amount must be numeric'),
    body('remainingBalance').isNumeric().withMessage('Remaining balance must be numeric'),
    body('penaltyAmount').optional().isNumeric().withMessage('Penalty amount must be numeric'),
    body('processingFeeAmount').optional().isNumeric().withMessage('Processing fee amount must be numeric'),
    body('collectedBy').optional().trim()
  ],
  validateRequest,
  generatePaymentReceipt
);

// Generate loan statement PDF
router.post('/generate/loan-statement',
  [
    body('loanId').trim().notEmpty().withMessage('Loan ID is required'),
    body('customerName').trim().notEmpty().withMessage('Customer name is required'),
    body('customerPhone').trim().notEmpty().withMessage('Customer phone is required'),
    body('loanAmount').isNumeric().withMessage('Loan amount must be numeric'),
    body('interestRate').isNumeric().withMessage('Interest rate must be numeric'),
    body('startDate').isISO8601().withMessage('Start date must be valid'),
    body('maturityDate').isISO8601().withMessage('Maturity date must be valid'),
    body('currentBalance').isNumeric().withMessage('Current balance must be numeric'),
    body('totalPaid').isNumeric().withMessage('Total paid must be numeric'),
    body('paymentHistory').isArray().withMessage('Payment history must be an array'),
    body('upcomingEMIs').isArray().withMessage('Upcoming EMIs must be an array'),
    body('statementPeriod.from').isISO8601().withMessage('Statement period from date must be valid'),
    body('statementPeriod.to').isISO8601().withMessage('Statement period to date must be valid')
  ],
  validateRequest,
  generateLoanStatement
);

// Generate business report PDF
router.post('/generate/business-report',
  [
    body('reportType').trim().notEmpty().withMessage('Report type is required'),
    body('reportPeriod.from').isISO8601().withMessage('Report period from date must be valid'),
    body('reportPeriod.to').isISO8601().withMessage('Report period to date must be valid'),
    body('totalLoans').isInt({ min: 0 }).withMessage('Total loans must be a non-negative integer'),
    body('totalAmount').isNumeric().withMessage('Total amount must be numeric'),
    body('totalCollections').isNumeric().withMessage('Total collections must be numeric'),
    body('activeLoans').isInt({ min: 0 }).withMessage('Active loans must be a non-negative integer'),
    body('overdueLoans').isInt({ min: 0 }).withMessage('Overdue loans must be a non-negative integer'),
    body('defaultLoans').isInt({ min: 0 }).withMessage('Default loans must be a non-negative integer'),
    body('profitLoss').isObject().withMessage('Profit loss must be an object'),
    body('topPerformers').isArray().withMessage('Top performers must be an array'),
    body('monthlyTrends').isArray().withMessage('Monthly trends must be an array')
  ],
  validateRequest,
  generateBusinessReport
);

// Delete document
router.delete('/:documentId',
  [
    param('documentId')
      .trim()
      .notEmpty()
      .withMessage('Document ID is required')
  ],
  validateRequest,
  deleteDocument
);

// Get available document templates
router.get('/templates/available',
  getDocumentTemplates
);

// Generic document generation endpoint
router.post('/generate',
  [
    body('templateType')
      .isIn(['receipt', 'statement', 'agreement', 'certificate', 'report', 'notice'])
      .withMessage('Invalid template type'),
    body('loanId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Loan ID cannot be empty'),
    body('paymentId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Payment ID cannot be empty'),
    body('customerId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Customer ID cannot be empty'),
    body('customParameters')
      .optional()
      .isObject()
      .withMessage('Custom parameters must be an object')
  ],
  validateRequest,
  generateGenericDocument
);

export default router;