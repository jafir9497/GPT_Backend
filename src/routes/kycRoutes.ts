import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  getKYCStatus,
  uploadKYCDocument,
  updateKYCDocumentNumber,
  verifyKYCDocuments,
  getPendingKYCVerifications,
  checkKYCVerificationStatus
} from '../controllers/kycController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get current user's KYC status
router.get('/status',
  getKYCStatus
);

// Upload KYC document (link existing document to KYC)
router.post('/documents/upload',
  [
    body('documentType')
      .isIn(['AADHAR', 'PAN', 'SELFIE'])
      .withMessage('Document type must be AADHAR, PAN, or SELFIE'),
    body('documentId')
      .trim()
      .notEmpty()
      .withMessage('Document ID is required')
  ],
  validateRequest,
  uploadKYCDocument
);

// Update document numbers (Aadhar/PAN)
router.patch('/documents/number',
  [
    body('documentType')
      .isIn(['AADHAR', 'PAN'])
      .withMessage('Document type must be AADHAR or PAN'),
    body('documentNumber')
      .trim()
      .notEmpty()
      .withMessage('Document number is required')
      .isLength({ min: 10, max: 20 })
      .withMessage('Document number must be between 10 and 20 characters')
  ],
  validateRequest,
  updateKYCDocumentNumber
);

// Verify KYC documents (Admin/Employee only)
router.patch('/verify/:userId',
  [
    param('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required'),
    body('status')
      .isIn(['VERIFIED', 'REJECTED'])
      .withMessage('Status must be VERIFIED or REJECTED'),
    body('verificationNotes')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Verification notes must not exceed 1000 characters'),
    body('rejectionReason')
      .if(body('status').equals('REJECTED'))
      .trim()
      .notEmpty()
      .withMessage('Rejection reason is required when status is REJECTED')
      .isLength({ max: 500 })
      .withMessage('Rejection reason must not exceed 500 characters')
  ],
  validateRequest,
  verifyKYCDocuments
);

// Get pending KYC verifications (Admin/Employee only)
router.get('/pending',
  [
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
  getPendingKYCVerifications
);

// Check KYC verification status for specific user
router.get('/verification-status/:userId',
  [
    param('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required')
  ],
  validateRequest,
  checkKYCVerificationStatus
);

// Check KYC verification status for current user
router.get('/verification-status',
  validateRequest,
  checkKYCVerificationStatus
);

export default router;