import { Response } from 'express';
import { PrismaClient, DocumentType } from '@prisma/client';
import { AuthRequest } from '../types/express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { PDFGenerationService } from '../services/pdfGenerationService';
import { DocumentStorageService, DocumentCategory, EntityType } from '../services/documentStorageService';
import { LoanCalculationService } from '../services/loanCalculationService';

const prisma = new PrismaClient();

// Initialize services
const documentStorageService = new DocumentStorageService();
const pdfGenerationService = new PDFGenerationService(documentStorageService);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads/documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, '');
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, PDF, DOC, and DOCX files are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Upload document
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      documentName,
      documentCategory,
      documentType,
      relatedEntityType,
      relatedEntityId,
      description,
      isRequired = false,
      expiryDate
    } = req.body;

    const file = req.file;
    const userId = req.user!.userId;

    if (!file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
      return;
    }

    // Validate required fields
    if (!documentName || !documentCategory) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }

    // Create document record
    const document = await prisma.document.create({
      data: {
        title: documentName,
        documentCategory: documentCategory,
        documentType: documentType as DocumentType || DocumentType.PHOTO,
        fileName: file.filename,
        filePath: file.path,
        fileSize: BigInt(file.size),
        mimeType: file.mimetype,
        loanId: relatedEntityType === 'LOAN' ? relatedEntityId : null,
        customerId: relatedEntityType === 'CUSTOMER' ? relatedEntityId : null,
        expiresAt: expiryDate ? new Date(expiryDate) : null,
        createdBy: userId
      }
    });

    res.status(201).json({
      success: true,
      data: {
        document,
        message: 'Document uploaded successfully'
      }
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to upload document'
      }
    });
  }
};

// Get documents for an entity
export const getEntityDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entityType, entityId } = req.params;
    const { category, type, page = 1, limit = 10 } = req.query;
    const userId = req.user!.userId;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};

    if (entityType === 'LOAN') {
      whereClause.loanId = entityId;
    } else if (entityType === 'CUSTOMER') {
      whereClause.customerId = entityId;
    }

    if (category) {
      whereClause.documentCategory = category;
    }

    if (type) {
      whereClause.documentType = type;
    }

    // Check access permissions based on entity type
    if (entityType === 'LOAN_APPLICATION' || entityType === 'ACTIVE_LOAN') {
      const userType = req.user!.userType;
      if (userType === 'CUSTOMER') {
        // Customers can only see their own documents
        const entityExists = await prisma.loanApplication.findFirst({
          where: {
            applicationId: entityId,
            customerId: userId
          }
        });

        if (!entityExists) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied'
            }
          });
          return;
        }
      }
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        createdByUser: {
          select: {
            firstName: true,
            lastName: true,
            userType: true
          }
        }
      }
    });

    const total = await prisma.document.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Get entity documents error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve documents'
      }
    });
  }
};

// Get document details
export const getDocumentDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.userId;

    const document = await prisma.document.findUnique({
      where: { documentId },
      include: {
        createdByUser: {
          select: {
            firstName: true,
            lastName: true,
            userType: true
          }
        }
      }
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Document not found'
        }
      });
      return;
    }

    // Check access permissions
    const userType = req.user!.userType;
    if (userType === 'CUSTOMER') {
      // Verify customer has access to this document
      if (document.customerId && document.customerId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
        return;
      }
    }

    res.json({
      success: true,
      data: { document }
    });

  } catch (error) {
    console.error('Get document details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve document details'
      }
    });
  }
};

// Download document
export const downloadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.userId;

    const document = await prisma.document.findUnique({
      where: { documentId }
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Document not found'
        }
      });
      return;
    }

    // Check access permissions
    const userType = req.user!.userType;
    if (userType === 'CUSTOMER') {
      // Verify customer has access to this document
      if (document.customerId && document.customerId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
        return;
      }
    }

    // Check if file exists
    try {
      await fs.access(document.filePath);
    } catch {
      res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Document file not found on server'
        }
      });
      return;
    }

    // Set appropriate headers
    res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    if (document.fileSize) {
      res.setHeader('Content-Length', document.fileSize.toString());
    }

    // Stream the file
    const fileStream = require('fs').createReadStream(document.filePath);
    fileStream.pipe(res);

    // Log download activity
    await prisma.document.update({
      where: { documentId },
      data: {
        lastAccessed: new Date(),
        downloadCount: {
          increment: 1
        }
      }
    });

  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to download document'
      }
    });
  }
};

// Generate loan agreement PDF
export const generateLoanAgreement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      loanId,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      loanAmount,
      interestRate,
      tenure,
      goldWeight,
      goldPurity,
      goldValue,
      startDate,
      processingFee,
      terms
    } = req.body;

    const userId = req.user!.userId;

    // Calculate EMI and maturity date
    const emiAmount = LoanCalculationService.calculateReducingBalanceEMI(
      loanAmount,
      interestRate,
      tenure
    );
    
    const maturityDate = new Date(startDate);
    maturityDate.setMonth(maturityDate.getMonth() + tenure);

    const pdfResult = await pdfGenerationService.generateLoanAgreement({
      loanId,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      loanAmount,
      interestRate,
      tenure,
      goldWeight,
      goldPurity,
      goldValue,
      startDate: new Date(startDate),
      maturityDate,
      emiAmount,
      processingFee,
      terms: terms || [
        'The borrower agrees to repay the loan amount with interest as per the EMI schedule.',
        'The gold jewelry pledged serves as collateral for this loan.',
        'In case of default, the lender has the right to auction the pledged gold.',
        'The borrower can make part payments or foreclose the loan at any time.',
        'Any changes to the loan terms must be agreed upon in writing.',
        'The loan is subject to the terms and conditions of the company.',
      ]
    });

    // Store in document system
    const documentId = await pdfGenerationService.storePDF(
      pdfResult,
      DocumentCategory.LOAN_AGREEMENT,
      EntityType.LOAN,
      loanId,
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        documentId,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        message: 'Loan agreement generated successfully'
      }
    });
  } catch (error: any) {
    console.error('Error generating loan agreement:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DOCUMENT_GENERATION_FAILED',
        message: 'Failed to generate loan agreement',
        details: error.message
      }
    });
  }
};

// Generate payment receipt PDF
export const generatePaymentReceipt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      receiptNumber,
      paymentId,
      loanId,
      customerName,
      paymentAmount,
      paymentDate,
      paymentMethod,
      principalAmount,
      interestAmount,
      penaltyAmount,
      processingFeeAmount,
      remainingBalance,
      collectedBy
    } = req.body;

    const userId = req.user!.userId;

    const pdfResult = await pdfGenerationService.generatePaymentReceipt({
      receiptNumber,
      paymentId,
      loanId,
      customerName,
      paymentAmount,
      paymentDate: new Date(paymentDate),
      paymentMethod,
      principalAmount,
      interestAmount,
      penaltyAmount: penaltyAmount || 0,
      processingFeeAmount: processingFeeAmount || 0,
      remainingBalance,
      collectedBy
    });

    const documentId = await pdfGenerationService.storePDF(
      pdfResult,
      DocumentCategory.PAYMENT_RECEIPT,
      EntityType.PAYMENT,
      paymentId,
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        documentId,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        message: 'Payment receipt generated successfully'
      }
    });
  } catch (error: any) {
    console.error('Error generating payment receipt:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DOCUMENT_GENERATION_FAILED',
        message: 'Failed to generate payment receipt',
        details: error.message
      }
    });
  }
};

// Generate loan statement PDF
export const generateLoanStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      loanId,
      customerName,
      customerPhone,
      loanAmount,
      interestRate,
      startDate,
      maturityDate,
      currentBalance,
      totalPaid,
      paymentHistory,
      upcomingEMIs,
      statementPeriod
    } = req.body;

    const userId = req.user!.userId;

    const pdfResult = await pdfGenerationService.generateLoanStatement({
      loanId,
      customerName,
      customerPhone,
      loanAmount,
      interestRate,
      startDate: new Date(startDate),
      maturityDate: new Date(maturityDate),
      currentBalance,
      totalPaid,
      paymentHistory: paymentHistory.map((payment: any) => ({
        ...payment,
        date: new Date(payment.date)
      })),
      upcomingEMIs: upcomingEMIs.map((emi: any) => ({
        ...emi,
        dueDate: new Date(emi.dueDate)
      })),
      statementPeriod: {
        from: new Date(statementPeriod.from),
        to: new Date(statementPeriod.to)
      }
    });

    const documentId = await pdfGenerationService.storePDF(
      pdfResult,
      DocumentCategory.LOAN_STATEMENT,
      EntityType.LOAN,
      loanId,
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        documentId,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        message: 'Loan statement generated successfully'
      }
    });
  } catch (error: any) {
    console.error('Error generating loan statement:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DOCUMENT_GENERATION_FAILED',
        message: 'Failed to generate loan statement',
        details: error.message
      }
    });
  }
};

// Generate business report PDF
export const generateBusinessReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      reportType,
      reportPeriod,
      totalLoans,
      totalAmount,
      totalCollections,
      activeLoans,
      overdueLoans,
      defaultLoans,
      profitLoss,
      topPerformers,
      monthlyTrends
    } = req.body;

    const userId = req.user!.userId;
    
    // Get user details for report generation
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true }
    });
    
    const userName = user ? `${user.firstName} ${user.lastName}` : 'Unknown User';

    const pdfResult = await pdfGenerationService.generateBusinessReport({
      reportType,
      reportPeriod: {
        from: new Date(reportPeriod.from),
        to: new Date(reportPeriod.to)
      },
      totalLoans,
      totalAmount,
      totalCollections,
      activeLoans,
      overdueLoans,
      defaultLoans,
      profitLoss,
      topPerformers,
      monthlyTrends,
      generatedBy: userName
    });

    const documentId = await pdfGenerationService.storePDF(
      pdfResult,
      DocumentCategory.BUSINESS_REPORT,
      EntityType.SYSTEM,
      'business-report',
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        documentId,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        message: 'Business report generated successfully'
      }
    });
  } catch (error: any) {
    console.error('Error generating business report:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DOCUMENT_GENERATION_FAILED',
        message: 'Failed to generate business report',
        details: error.message
      }
    });
  }
};

// Delete document
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.userId;

    const document = await prisma.document.findUnique({
      where: { documentId }
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Document not found'
        }
      });
      return;
    }

    // Check permissions - only admin/employee or document owner can delete
    const userType = req.user!.userType;
    if (userType === 'CUSTOMER' && document.createdBy !== userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own documents'
        }
      });
      return;
    }

    // Delete file from filesystem
    try {
      await fs.unlink(document.filePath);
    } catch (error) {
      console.warn('Failed to delete file from filesystem:', error);
    }

    // Delete document record
    await prisma.document.delete({
      where: { documentId }
    });

    res.json({
      success: true,
      data: {
        message: 'Document deleted successfully'
      }
    });

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete document'
      }
    });
  }
};

// Get document templates
export const getDocumentTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = [
      {
        type: 'LOAN_AGREEMENT',
        name: 'Loan Agreement',
        description: 'Legal agreement between lender and borrower',
        category: 'LOAN_DOCUMENTATION',
        requiredFields: [
          'customerName', 'loanAmount', 'interestRate', 'tenure', 
          'goldDetails', 'terms', 'customerAddress', 'date'
        ]
      },
      {
        type: 'GOLD_APPRAISAL',
        name: 'Gold Appraisal Certificate',
        description: 'Certificate documenting gold item evaluation',
        category: 'GOLD_DOCUMENTATION',
        requiredFields: [
          'customerName', 'goldItems', 'totalWeight', 'purity', 
          'estimatedValue', 'appraiserName', 'date'
        ]
      },
      {
        type: 'PAYMENT_RECEIPT',
        name: 'Payment Receipt',
        description: 'Receipt for loan payments',
        category: 'PAYMENT_DOCUMENTATION',
        requiredFields: [
          'customerName', 'loanNumber', 'paymentAmount', 'paymentDate',
          'paymentMethod', 'receiptNumber', 'outstandingBalance'
        ]
      },
      {
        type: 'LOAN_CLOSURE',
        name: 'Loan Closure Certificate',
        description: 'Certificate confirming loan closure and gold release',
        category: 'LOAN_DOCUMENTATION',
        requiredFields: [
          'customerName', 'loanNumber', 'closureDate', 'finalPayment',
          'goldReleaseDetails', 'certificateNumber'
        ]
      },
      {
        type: 'KYC_SUMMARY',
        name: 'KYC Summary Report',
        description: 'Summary of customer KYC documentation',
        category: 'IDENTITY_PROOF',
        requiredFields: [
          'customerName', 'phoneNumber', 'address', 'idProof',
          'addressProof', 'verificationDate', 'verifiedBy'
        ]
      }
    ];

    res.json({
      success: true,
      data: { templates }
    });

  } catch (error) {
    console.error('Get document templates error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve document templates'
      }
    });
  }
};

// Helper function to generate PDF documents
async function generatePDFDocument(templateType: string, templateData: any) {
  try {
    // This would use a PDF generation library like PDFKit or Puppeteer
    // For now, we'll create a simple implementation
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    
    const doc = new PDFDocument();
    const fileName = `${templateType}_${Date.now()}.pdf`;
    const filePath = path.join(process.cwd(), 'uploads/documents', fileName);
    
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Generate PDF content based on template type
    switch (templateType) {
      case 'LOAN_AGREEMENT':
        generateLoanAgreementPDF(doc, templateData);
        break;
      case 'GOLD_APPRAISAL':
        generateGoldAppraisalPDF(doc, templateData);
        break;
      case 'PAYMENT_RECEIPT':
        generatePaymentReceiptPDF(doc, templateData);
        break;
      case 'LOAN_CLOSURE':
        generateLoanClosurePDF(doc, templateData);
        break;
      case 'KYC_SUMMARY':
        generateKYCSummaryPDF(doc, templateData);
        break;
      default:
        throw new Error('Unknown template type');
    }

    doc.end();

    // Wait for PDF generation to complete
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Get file size
    const stats = await fs.promises.stat(filePath);

    return {
      success: true,
      fileName,
      filePath,
      fileSize: stats.size
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed'
    };
  }
}

// PDF template generators
function generateLoanAgreementPDF(doc: any, data: any) {
  doc.fontSize(20).text('GOLD LOAN AGREEMENT', 100, 100, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, 100, 150);
  doc.text(`Customer: ${data.customerName}`, 100, 180);
  doc.text(`Loan Amount: ₹${data.loanAmount}`, 100, 210);
  doc.text(`Interest Rate: ${data.interestRate}% per annum`, 100, 240);
  doc.text(`Tenure: ${data.tenure} months`, 100, 270);
  doc.text('Terms and Conditions:', 100, 320);
  doc.text(data.terms || 'Standard terms apply', 100, 350);
}

function generateGoldAppraisalPDF(doc: any, data: any) {
  doc.fontSize(20).text('GOLD APPRAISAL CERTIFICATE', 100, 100, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, 100, 150);
  doc.text(`Customer: ${data.customerName}`, 100, 180);
  doc.text(`Total Weight: ${data.totalWeight} grams`, 100, 210);
  doc.text(`Purity: ${data.purity} karats`, 100, 240);
  doc.text(`Estimated Value: ₹${data.estimatedValue}`, 100, 270);
  doc.text(`Appraiser: ${data.appraiserName}`, 100, 300);
}

function generatePaymentReceiptPDF(doc: any, data: any) {
  doc.fontSize(20).text('PAYMENT RECEIPT', 100, 100, { align: 'center' });
  doc.fontSize(12).text(`Receipt No: ${data.receiptNumber}`, 100, 150);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 100, 180);
  doc.text(`Customer: ${data.customerName}`, 100, 210);
  doc.text(`Loan Number: ${data.loanNumber}`, 100, 240);
  doc.text(`Payment Amount: ₹${data.paymentAmount}`, 100, 270);
  doc.text(`Payment Method: ${data.paymentMethod}`, 100, 300);
  doc.text(`Outstanding Balance: ₹${data.outstandingBalance}`, 100, 330);
}

function generateLoanClosurePDF(doc: any, data: any) {
  doc.fontSize(20).text('LOAN CLOSURE CERTIFICATE', 100, 100, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, 100, 150);
  doc.text(`Customer: ${data.customerName}`, 100, 180);
  doc.text(`Loan Number: ${data.loanNumber}`, 100, 210);
  doc.text(`Closure Date: ${data.closureDate}`, 100, 240);
  doc.text(`Final Payment: ₹${data.finalPayment}`, 100, 270);
  doc.text('This certifies that the above loan has been closed successfully.', 100, 320);
}

function generateKYCSummaryPDF(doc: any, data: any) {
  doc.fontSize(20).text('KYC SUMMARY REPORT', 100, 100, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, 100, 150);
  doc.text(`Customer: ${data.customerName}`, 100, 180);
  doc.text(`Phone: ${data.phoneNumber}`, 100, 210);
  doc.text(`Address: ${data.address}`, 100, 240);
  doc.text(`ID Proof: ${data.idProof}`, 100, 270);
  doc.text(`Address Proof: ${data.addressProof}`, 100, 300);
  doc.text(`Verified By: ${data.verifiedBy}`, 100, 330);
}

// Generic document generation endpoint
export const generateGenericDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { templateType, loanId, paymentId, customerId, customParameters = {} } = req.body;
    const userId = req.user!.userId;

    // Route to specific generation functions based on template type
    switch (templateType) {
      case 'receipt':
        if (!paymentId) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Payment ID is required for receipt generation' }
          });
          return;
        }
        await handleReceiptGeneration(req, res, paymentId, customParameters);
        break;

      case 'statement':
        if (!loanId) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Loan ID is required for statement generation' }
          });
          return;
        }
        await handleStatementGeneration(req, res, loanId, customParameters);
        break;

      case 'agreement':
        if (!loanId) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Loan ID is required for agreement generation' }
          });
          return;
        }
        await handleAgreementGeneration(req, res, loanId, customParameters);
        break;

      case 'certificate':
        await handleCertificateGeneration(req, res, loanId, customerId, customParameters);
        break;

      case 'report':
        await handleReportGeneration(req, res, customParameters);
        break;

      case 'notice':
        await handleNoticeGeneration(req, res, loanId, customerId, customParameters);
        break;

      default:
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_TEMPLATE', message: 'Invalid template type specified' }
        });
    }

  } catch (error) {
    console.error('Generic document generation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to generate document' }
    });
  }
};

// Helper function for receipt generation
async function handleReceiptGeneration(req: AuthRequest, res: Response, paymentId: string, customParameters: any) {
  const payment = await prisma.payment.findUnique({
    where: { paymentId },
    include: {
      loan: {
        include: {
          customer: true
        }
      }
    }
  });

  if (!payment) {
    res.status(404).json({
      success: false,
      error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }
    });
    return;
  }

  // Merge custom parameters with payment data
  const receiptData = {
    receiptNumber: payment.receiptNumber || `RCP${Date.now()}`,
    paymentId: payment.paymentId,
    loanId: payment.loanId,
    customerName: `${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
    paymentAmount: parseFloat(payment.paymentAmount.toString()),
    paymentDate: payment.paymentDate.toISOString(),
    paymentMethod: payment.paymentMethod,
    principalAmount: parseFloat(payment.principalPayment.toString()),
    interestAmount: parseFloat(payment.interestPayment.toString()),
    remainingBalance: parseFloat(payment.loan.totalOutstanding.toString()),
    ...customParameters
  };

  // Use existing receipt generation function
  req.body = receiptData;
  await generatePaymentReceipt(req, res);
}

// Helper function for statement generation
async function handleStatementGeneration(req: AuthRequest, res: Response, loanId: string, customParameters: any) {
  const loan = await prisma.activeLoan.findUnique({
    where: { loanId },
    include: {
      customer: true,
      payments: { orderBy: { paymentDate: 'desc' } }
    }
  });

  if (!loan) {
    res.status(404).json({
      success: false,
      error: { code: 'LOAN_NOT_FOUND', message: 'Loan not found' }
    });
    return;
  }

  const statementData = {
    loanId: loan.loanId,
    customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
    customerPhone: loan.customer.phoneNumber,
    loanAmount: parseFloat(loan.principalAmount.toString()),
    interestRate: parseFloat(loan.interestRate.toString()),
    startDate: loan.loanStartDate.toISOString(),
    maturityDate: loan.loanEndDate.toISOString(),
    currentBalance: parseFloat(loan.totalOutstanding.toString()),
    totalPaid: loan.payments.reduce((sum, p) => sum + parseFloat(p.paymentAmount.toString()), 0),
    paymentHistory: loan.payments.map(p => ({
      date: p.paymentDate.toISOString().split('T')[0],
      amount: parseFloat(p.paymentAmount.toString()),
      method: p.paymentMethod,
      receiptNumber: p.receiptNumber
    })),
    upcomingEMIs: [], // Can be calculated based on loan terms
    statementPeriod: {
      from: customParameters.fromDate || loan.loanStartDate.toISOString(),
      to: customParameters.toDate || new Date().toISOString()
    },
    ...customParameters
  };

  req.body = statementData;
  await generateLoanStatement(req, res);
}

// Helper function for agreement generation
async function handleAgreementGeneration(req: AuthRequest, res: Response, loanId: string, customParameters: any) {
  const loan = await prisma.activeLoan.findUnique({
    where: { loanId },
    include: {
      customer: true,
      application: true
    }
  });

  if (!loan) {
    res.status(404).json({
      success: false,
      error: { code: 'LOAN_NOT_FOUND', message: 'Loan not found' }
    });
    return;
  }

  const agreementData = {
    loanId: loan.loanId,
    customerId: loan.customerId,
    customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
    customerPhone: loan.customer.phoneNumber,
    customerAddress: [
      loan.customer.addressLine1,
      loan.customer.addressLine2,
      loan.customer.city,
      loan.customer.state
    ].filter(Boolean).join(', '),
    loanAmount: parseFloat(loan.principalAmount.toString()),
    interestRate: parseFloat(loan.interestRate.toString()),
    tenure: loan.loanTenureMonths,
    goldWeight: loan.application?.totalWeight ? parseFloat(loan.application.totalWeight.toString()) : 0,
    goldPurity: 22, // Default, can be extracted from application
    goldValue: loan.application?.estimatedValue ? parseFloat(loan.application.estimatedValue.toString()) : 0,
    startDate: loan.loanStartDate.toISOString(),
    processingFee: customParameters.processingFee || 0,
    terms: customParameters.terms || [],
    ...customParameters
  };

  req.body = agreementData;
  await generateLoanAgreement(req, res);
}

// Helper function for certificate generation
async function handleCertificateGeneration(req: AuthRequest, res: Response, loanId?: string, customerId?: string, customParameters: any = {}) {
  const certificateType = customParameters.certificateType || 'loan_closure';
  
  let certificateData: any = {
    certificateType,
    issueDate: new Date().toISOString(),
    ...customParameters
  };

  if (loanId) {
    const loan = await prisma.activeLoan.findUnique({
      where: { loanId },
      include: { customer: true }
    });
    
    if (loan) {
      certificateData = {
        ...certificateData,
        customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
        loanNumber: loan.loanNumber,
        loanAmount: parseFloat(loan.principalAmount.toString()),
        loanStatus: loan.loanStatus
      };
    }
  }

  // Generate certificate PDF using custom template
  const pdfBuffer = await generateCustomCertificatePDF(certificateData);
  
  // Save document to storage
  const fileName = `certificate_${certificateType}_${Date.now()}.pdf`;
  const filePath = await documentStorageService.saveFile(
    pdfBuffer,
    fileName,
    loanId ? EntityType.LOAN : EntityType.CUSTOMER,
    loanId || customerId || 'system',
    DocumentCategory.GENERATED
  );

  res.json({
    success: true,
    data: {
      documentPath: filePath,
      documentType: 'certificate',
      downloadUrl: `/api/v1/documents/download/${fileName}`,
      message: 'Certificate generated successfully'
    }
  });
}

// Helper function for report generation
async function handleReportGeneration(req: AuthRequest, res: Response, customParameters: any) {
  const reportType = customParameters.reportType || 'business';
  const reportPeriod = customParameters.reportPeriod || {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    to: new Date().toISOString()
  };

  // Get report data based on type
  const reportData = await generateReportData(reportType, reportPeriod);
  
  const finalReportData = {
    reportType,
    reportPeriod,
    ...reportData,
    ...customParameters
  };

  req.body = finalReportData;
  await generateBusinessReport(req, res);
}

// Helper function for notice generation
async function handleNoticeGeneration(req: AuthRequest, res: Response, loanId?: string, customerId?: string, customParameters: any = {}) {
  const noticeType = customParameters.noticeType || 'payment_reminder';
  
  let noticeData: any = {
    noticeType,
    issueDate: new Date().toISOString(),
    ...customParameters
  };

  if (loanId) {
    const loan = await prisma.activeLoan.findUnique({
      where: { loanId },
      include: { customer: true }
    });
    
    if (loan) {
      noticeData = {
        ...noticeData,
        customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
        loanNumber: loan.loanNumber,
        outstandingAmount: parseFloat(loan.totalOutstanding.toString()),
        nextDueDate: loan.nextDueDate?.toISOString()
      };
    }
  }

  // Generate notice PDF
  const pdfBuffer = await generateCustomNoticePDF(noticeData);
  
  const fileName = `notice_${noticeType}_${Date.now()}.pdf`;
  const filePath = await documentStorageService.saveFile(
    pdfBuffer,
    fileName,
    loanId ? EntityType.LOAN : EntityType.CUSTOMER,
    loanId || customerId || 'system',
    DocumentCategory.GENERATED
  );

  res.json({
    success: true,
    data: {
      documentPath: filePath,
      documentType: 'notice',
      downloadUrl: `/api/v1/documents/download/${fileName}`,
      message: 'Notice generated successfully'
    }
  });
}

// Custom PDF generation functions
async function generateCustomCertificatePDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Certificate content
      doc.fontSize(24).text('CERTIFICATE', 100, 100, { align: 'center' });
      doc.fontSize(16).text(`Certificate Type: ${data.certificateType}`, 100, 150);
      doc.text(`Issue Date: ${new Date(data.issueDate).toLocaleDateString()}`, 100, 180);
      
      if (data.customerName) {
        doc.text(`Customer: ${data.customerName}`, 100, 210);
      }
      if (data.loanNumber) {
        doc.text(`Loan Number: ${data.loanNumber}`, 100, 240);
      }

      doc.fontSize(12).text('This certificate is issued by GPT Gold Loan Services.', 100, 300);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 100, 700);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function generateCustomNoticePDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Notice content
      doc.fontSize(20).text('OFFICIAL NOTICE', 100, 100, { align: 'center' });
      doc.fontSize(14).text(`Notice Type: ${data.noticeType}`, 100, 150);
      doc.text(`Date: ${new Date(data.issueDate).toLocaleDateString()}`, 100, 180);
      
      if (data.customerName) {
        doc.text(`To: ${data.customerName}`, 100, 220);
      }
      if (data.loanNumber) {
        doc.text(`Re: Loan Number ${data.loanNumber}`, 100, 250);
      }

      doc.fontSize(12);
      if (data.noticeType === 'payment_reminder' && data.outstandingAmount) {
        doc.text(`Outstanding Amount: ₹${data.outstandingAmount}`, 100, 300);
        doc.text(`Next Due Date: ${data.nextDueDate ? new Date(data.nextDueDate).toLocaleDateString() : 'N/A'}`, 100, 320);
        doc.text('Please make the payment by the due date to avoid penalties.', 100, 350);
      }

      doc.text('GPT Gold Loan Services', 100, 700);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 100, 720);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function generateReportData(reportType: string, reportPeriod: any) {
  // Basic report data - can be enhanced based on requirements
  const fromDate = new Date(reportPeriod.from);
  const toDate = new Date(reportPeriod.to);

  const totalLoans = await prisma.activeLoan.count({
    where: {
      loanStartDate: {
        gte: fromDate,
        lte: toDate
      }
    }
  });

  const totalAmount = await prisma.activeLoan.aggregate({
    where: {
      loanStartDate: {
        gte: fromDate,
        lte: toDate
      }
    },
    _sum: {
      principalAmount: true
    }
  });

  const totalCollections = await prisma.payment.aggregate({
    where: {
      paymentDate: {
        gte: fromDate,
        lte: toDate
      },
      paymentStatus: 'COMPLETED'
    },
    _sum: {
      paymentAmount: true
    }
  });

  return {
    totalLoans,
    totalAmount: totalAmount._sum.principalAmount || 0,
    totalCollections: totalCollections._sum.paymentAmount || 0,
    activeLoans: await prisma.activeLoan.count({ where: { loanStatus: 'ACTIVE' } }),
    overdueLoans: 0, // Can be calculated based on due dates
    defaultLoans: await prisma.activeLoan.count({ where: { loanStatus: 'DEFAULTED' } }),
    profitLoss: { profit: 0, loss: 0 }, // Simplified
    topPerformers: [],
    monthlyTrends: []
  };
}