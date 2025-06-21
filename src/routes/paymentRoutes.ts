import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  initiatePayment,
  updatePaymentStatus,
  getCustomerPayments,
  getPaymentDetails,
  getPaymentMethods,
  calculatePaymentFees,
  verifyPayment,
  handlePaymentWebhook,
  createPaymentLink,
  getPaymentMethodsWithGateway,
  recordOfflinePayment
} from '../controllers/paymentController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Initiate payment
router.post('/initiate',
  [
    body('loanId')
      .trim()
      .notEmpty()
      .withMessage('Loan ID is required'),
    body('paymentAmount')
      .isFloat({ min: 1 })
      .withMessage('Payment amount must be at least ₹1'),
    body('paymentMethod')
      .isIn(['UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'NET_BANKING', 'CASH', 'BANK_TRANSFER'])
      .withMessage('Invalid payment method'),
    body('paymentType')
      .optional()
      .isIn(['EMI', 'PARTIAL', 'FULL', 'PENALTY', 'LATE_FEE'])
      .withMessage('Invalid payment type'),
    body('scheduleDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid schedule date format'),
    body('isPartialPayment')
      .optional()
      .isBoolean()
      .withMessage('isPartialPayment must be boolean'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ],
  validateRequest,
  initiatePayment
);

// Update payment status (for webhooks/manual updates)
router.patch('/:paymentId/status',
  [
    param('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required'),
    body('status')
      .isIn(['PENDING', 'INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'])
      .withMessage('Invalid payment status'),
    body('transactionId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Transaction ID cannot be empty'),
    body('failureReason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Failure reason must not exceed 500 characters'),
    body('paidAt')
      .optional()
      .isISO8601()
      .withMessage('Invalid paid date format'),
    body('collectedBy')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Collected by cannot be empty'),
    body('collectionLocation')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Collection location must not exceed 200 characters')
  ],
  validateRequest,
  updatePaymentStatus
);

// Get customer payments
router.get('/history',
  [
    query('loanId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Loan ID cannot be empty'),
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
      .isIn(['PENDING', 'INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'SCHEDULED'])
      .withMessage('Invalid payment status'),
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
  getCustomerPayments
);

// Get payment details
router.get('/:paymentId',
  [
    param('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
  ],
  validateRequest,
  getPaymentDetails
);


// Get available payment methods
router.get('/methods/available',
  getPaymentMethods
);

// Calculate payment fees
router.post('/calculate-fees',
  [
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be at least ₹1'),
    body('paymentMethod')
      .isIn(['UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'NET_BANKING', 'CASH', 'BANK_TRANSFER'])
      .withMessage('Invalid payment method')
  ],
  validateRequest,
  calculatePaymentFees
);

// Verify payment (called after payment completion)
router.post('/verify',
  [
    body('razorpay_order_id')
      .trim()
      .notEmpty()
      .withMessage('Razorpay order ID is required'),
    body('razorpay_payment_id')
      .trim()
      .notEmpty()
      .withMessage('Razorpay payment ID is required'),
    body('razorpay_signature')
      .trim()
      .notEmpty()
      .withMessage('Razorpay signature is required'),
    body('paymentId')
      .trim()
      .notEmpty()
      .withMessage('Payment ID is required')
  ],
  validateRequest,
  verifyPayment
);

// Create payment link
router.post('/link',
  [
    body('loanId')
      .trim()
      .notEmpty()
      .withMessage('Loan ID is required'),
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Amount must be at least ₹1'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Description must not exceed 200 characters'),
    body('expiryHours')
      .optional()
      .isInt({ min: 1, max: 168 }) // 1 hour to 7 days
      .withMessage('Expiry hours must be between 1 and 168')
  ],
  validateRequest,
  createPaymentLink
);

// Get payment methods with gateway support
router.get('/methods/gateway',
  [
    query('amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Amount must be a valid number')
  ],
  validateRequest,
  getPaymentMethodsWithGateway
);

// Record offline payment (for field agents)
router.post('/record-offline',
  [
    body('loanId')
      .trim()
      .notEmpty()
      .withMessage('Loan ID is required'),
    body('paymentAmount')
      .isFloat({ min: 1 })
      .withMessage('Payment amount must be at least ₹1'),
    body('paymentMethod')
      .isIn(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD'])
      .withMessage('Invalid payment method for offline collection'),
    body('collectionDetails')
      .isObject()
      .withMessage('Collection details are required'),
    body('collectionDetails.location')
      .optional()
      .isObject()
      .withMessage('Location must be an object'),
    body('collectionDetails.location.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Invalid latitude'),
    body('collectionDetails.location.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Invalid longitude'),
    body('collectionDetails.customerSignature')
      .optional()
      .isString()
      .withMessage('Customer signature must be a string'),
    body('collectionDetails.proofPhotos')
      .optional()
      .isArray()
      .withMessage('Proof photos must be an array'),
    body('paymentType')
      .optional()
      .isIn(['EMI', 'PARTIAL', 'FULL', 'INTEREST'])
      .withMessage('Invalid payment type'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ],
  validateRequest,
  recordOfflinePayment
);

// Webhook endpoint (no authentication required)
const webhookRouter = express.Router();
webhookRouter.post('/webhook', 
  express.raw({ type: 'application/json' }),
  handlePaymentWebhook
);

// Export both routers
export default router;
export { webhookRouter };