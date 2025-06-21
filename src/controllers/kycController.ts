import { Response } from 'express';
import { PrismaClient, KYCStatus, KYCDocumentType } from '@prisma/client';
import { AuthRequest } from '../types/express';
import { body, param } from 'express-validator';
import { KYCService } from '../services/kycService';

const prisma = new PrismaClient();
const kycService = new KYCService();

// Helper function to format KYC data with organized documents
const formatKYCData = (kycDetails: any) => {
  const documents = {
    aadharDocuments: {} as any,
    panDocuments: {} as any,
    selfieDocuments: {} as any
  };

  // Organize documents by type and subtype
  kycDetails.kycDocuments?.forEach((kycDoc: any) => {
    const subType = kycDoc.subType || 'main';
    switch (kycDoc.documentType) {
      case 'AADHAR':
        documents.aadharDocuments[subType] = {
          documentId: kycDoc.documentId,
          verified: kycDoc.verified,
          uploadedAt: kycDoc.uploadedAt,
          document: kycDoc.document
        };
        break;
      case 'PAN':
        documents.panDocuments[subType] = {
          documentId: kycDoc.documentId,
          verified: kycDoc.verified,
          uploadedAt: kycDoc.uploadedAt,
          document: kycDoc.document
        };
        break;
      case 'SELFIE':
        documents.selfieDocuments[subType] = {
          documentId: kycDoc.documentId,
          verified: kycDoc.verified,
          uploadedAt: kycDoc.uploadedAt,
          document: kycDoc.document
        };
        break;
    }
  });

  return {
    ...kycDetails,
    ...documents
  };
};

// Get KYC status for current user
export const getKYCStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const kycDetails = await prisma.kYCDetail.findUnique({
      where: { userId },
      include: {
        kycDocuments: {
          include: {
            document: true
          }
        }
      }
    });

    if (!kycDetails) {
      // Create new KYC record if it doesn't exist
      const newKYCDetails = await prisma.kYCDetail.create({
        data: {
          userId,
          kycStatus: KYCStatus.INCOMPLETE
        },
        include: {
          kycDocuments: {
            include: {
              document: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: formatKYCData(newKYCDetails)
      });
      return;
    }

    res.json({
      success: true,
      data: formatKYCData(kycDetails)
    });
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch KYC status'
      }
    });
  }
};

// Upload KYC document
export const uploadKYCDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentType, documentId, subType } = req.body;
    const userId = req.user!.userId;

    // Validate document type
    const validTypes = ['AADHAR', 'PAN', 'SELFIE'];
    if (!validTypes.includes(documentType)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENT_TYPE',
          message: 'Invalid document type. Must be AADHAR, PAN, or SELFIE'
        }
      });
      return;
    }

    // Validate sub-type based on document type
    const validSubTypes: { [key: string]: string[] } = {
      'AADHAR': ['front', 'back'],
      'PAN': ['front', 'back'],
      'SELFIE': ['left', 'right', 'center']
    };

    if (subType && !validSubTypes[documentType]?.includes(subType)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SUB_TYPE',
          message: `Invalid sub-type for ${documentType}. Valid sub-types: ${validSubTypes[documentType]?.join(', ')}`
        }
      });
      return;
    }

    // Verify document exists
    const document = await prisma.document.findUnique({
      where: { documentId }
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found'
        }
      });
      return;
    }

    // Get or create KYC details
    let kycDetails = await prisma.kYCDetail.findUnique({
      where: { userId }
    });

    if (!kycDetails) {
      kycDetails = await prisma.kYCDetail.create({
        data: {
          userId,
          kycStatus: KYCStatus.INCOMPLETE
        }
      });
    }

    // Check if this document type + subType combination already exists
    const existingKYCDoc = await prisma.kYCDocument.findUnique({
      where: {
        kycId_documentType_subType: {
          kycId: kycDetails.kycId,
          documentType: documentType as KYCDocumentType,
          subType: subType
        }
      }
    });

    if (existingKYCDoc) {
      // Update existing document
      await prisma.kYCDocument.update({
        where: { id: existingKYCDoc.id },
        data: {
          documentId: documentId,
          uploadedAt: new Date()
        }
      });
    } else {
      // Create new KYC document entry
      await prisma.kYCDocument.create({
        data: {
          kycId: kycDetails.kycId,
          documentId: documentId,
          documentType: documentType as KYCDocumentType,
          subType: subType
        }
      });
    }

    // Get updated KYC details with all documents
    const updatedKYC = await prisma.kYCDetail.findUnique({
      where: { userId },
      include: {
        kycDocuments: {
          include: {
            document: true
          }
        }
      }
    });

    // Check if all required documents are uploaded and update status
    const requiredDocs = {
      'AADHAR': ['front', 'back'],
      'PAN': ['front', 'back'],
      'SELFIE': ['left', 'right', 'center']
    };

    let allDocsUploaded = true;
    for (const [type, subTypes] of Object.entries(requiredDocs)) {
      for (const subType of subTypes) {
        const hasDoc = updatedKYC?.kycDocuments?.some(
          doc => doc.documentType === type && doc.subType === subType
        );
        if (!hasDoc) {
          allDocsUploaded = false;
          break;
        }
      }
      if (!allDocsUploaded) break;
    }

    if (allDocsUploaded && updatedKYC?.kycStatus === 'INCOMPLETE') {
      await prisma.kYCDetail.update({
        where: { userId },
        data: { kycStatus: KYCStatus.PENDING_VERIFICATION }
      });
    }

    res.json({
      success: true,
      data: formatKYCData(updatedKYC),
      message: `${documentType}${subType ? ` (${subType})` : ''} document uploaded successfully`
    });
  } catch (error) {
    console.error('Error uploading KYC document:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload KYC document'
      }
    });
  }
};

// Update KYC document number (Aadhar/PAN)
export const updateKYCDocumentNumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentType, documentNumber } = req.body;
    const userId = req.user!.userId;

    // Validate document type
    if (!['AADHAR', 'PAN'].includes(documentType)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENT_TYPE',
          message: 'Invalid document type. Must be AADHAR or PAN'
        }
      });
      return;
    }

    // Validate document number format
    const validationResult = kycService.validateDocumentNumber(documentType, documentNumber);
    if (!validationResult.isValid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENT_NUMBER',
          message: validationResult.message
        }
      });
      return;
    }

    // Get or create KYC details
    let kycDetails = await prisma.kYCDetail.findUnique({
      where: { userId }
    });

    if (!kycDetails) {
      kycDetails = await prisma.kYCDetail.create({
        data: {
          userId,
          kycStatus: KYCStatus.INCOMPLETE
        }
      });
    }

    // Update document number
    const updateData: any = {};
    if (documentType === 'AADHAR') {
      updateData.aadharNumber = documentNumber;
    } else if (documentType === 'PAN') {
      updateData.panNumber = documentNumber;
    }

    const updatedKYC = await prisma.kYCDetail.update({
      where: { userId },
      data: updateData,
      include: {
        kycDocuments: {
          include: {
            document: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: formatKYCData(updatedKYC),
      message: `${documentType} number updated successfully`
    });
  } catch (error) {
    console.error('Error updating KYC document number:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update KYC document number'
      }
    });
  }
};

// Verify KYC documents (Admin/Employee only)
export const verifyKYCDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status, verificationNotes, rejectionReason } = req.body;
    const verifierUserId = req.user!.userId;

    // Check if the current user has permission to verify (Admin/Employee)
    const currentUser = await prisma.user.findUnique({
      where: { userId: verifierUserId }
    });

    if (!currentUser || !['ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'].includes(currentUser.userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Only admin or employee can verify KYC documents'
        }
      });
      return;
    }

    // Validate status
    const validStatuses = ['VERIFIED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: 'Status must be VERIFIED or REJECTED'
        }
      });
      return;
    }

    // Update KYC verification status
    const updateData: any = {
      kycStatus: status as KYCStatus,
      verificationDate: new Date(),
      verifiedBy: verifierUserId,
      verificationNotes: verificationNotes || null,
    };

    if (status === 'VERIFIED') {
      updateData.aadharVerified = true;
      updateData.panVerified = true;
      updateData.selfieVerified = true;
      updateData.rejectionReason = null;
      updateData.resubmissionAllowed = true;
    } else if (status === 'REJECTED') {
      updateData.rejectionReason = rejectionReason;
      updateData.resubmissionAllowed = true;
    }

    const updatedKYC = await prisma.kYCDetail.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        },
        kycDocuments: {
          include: {
            document: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: formatKYCData(updatedKYC),
      message: `KYC documents ${status.toLowerCase()} successfully`
    });
  } catch (error) {
    console.error('Error verifying KYC documents:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify KYC documents'
      }
    });
  }
};

// Get all pending KYC verifications (Admin/Employee only)
export const getPendingKYCVerifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUser = req.user!;
    const { page = 1, limit = 10 } = req.query;

    // Check permissions
    if (!['ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'].includes(currentUser.userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Only admin or employee can view pending verifications'
        }
      });
      return;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [pendingKYCs, totalCount] = await Promise.all([
      prisma.kYCDetail.findMany({
        where: {
          kycStatus: KYCStatus.PENDING_VERIFICATION
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              email: true
            }
          },
          kycDocuments: {
            include: {
              document: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: {
          createdAt: 'asc' // Oldest first
        }
      }),
      prisma.kYCDetail.count({
        where: {
          kycStatus: KYCStatus.PENDING_VERIFICATION
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        kycVerifications: pendingKYCs.map(formatKYCData),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching pending KYC verifications:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch pending KYC verifications'
      }
    });
  }
};

// Check if user's KYC is verified
export const checkKYCVerificationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const targetUserId = userId || req.user!.userId;

    const kycDetails = await prisma.kYCDetail.findUnique({
      where: { userId: targetUserId },
      select: {
        kycStatus: true,
        verificationDate: true,
        rejectionReason: true,
        resubmissionAllowed: true
      }
    });

    const isVerified = kycDetails?.kycStatus === KYCStatus.VERIFIED;
    const isComplete = kycDetails !== null;

    res.json({
      success: true,
      data: {
        isVerified,
        isComplete,
        status: kycDetails?.kycStatus || 'NOT_STARTED',
        verificationDate: kycDetails?.verificationDate,
        rejectionReason: kycDetails?.rejectionReason,
        resubmissionAllowed: kycDetails?.resubmissionAllowed ?? true
      }
    });
  } catch (error) {
    console.error('Error checking KYC verification status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check KYC verification status'
      }
    });
  }
};