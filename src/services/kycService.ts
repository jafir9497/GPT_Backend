import { PrismaClient, KYCStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface DocumentValidationResult {
  isValid: boolean;
  message?: string;
}

export class KYCService {
  
  // Validate Aadhar number format
  validateAadharNumber(aadharNumber: string): DocumentValidationResult {
    // Remove spaces and hyphens
    const cleanAadhar = aadharNumber.replace(/[\s-]/g, '');
    
    // Check if it's 12 digits
    if (!/^\d{12}$/.test(cleanAadhar)) {
      return {
        isValid: false,
        message: 'Aadhar number must be exactly 12 digits'
      };
    }
    
    // Basic checksum validation using Verhoeff algorithm
    if (!this.verifyAadharChecksum(cleanAadhar)) {
      return {
        isValid: false,
        message: 'Invalid Aadhar number format'
      };
    }
    
    return { isValid: true };
  }
  
  // Validate PAN number format
  validatePANNumber(panNumber: string): DocumentValidationResult {
    const cleanPAN = panNumber.toUpperCase().replace(/\s/g, '');
    
    // PAN format: ABCDE1234F (5 letters, 4 digits, 1 letter)
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    
    if (!panRegex.test(cleanPAN)) {
      return {
        isValid: false,
        message: 'PAN number must be in format: ABCDE1234F (5 letters, 4 digits, 1 letter)'
      };
    }
    
    return { isValid: true };
  }
  
  // Validate document number based on type
  validateDocumentNumber(documentType: string, documentNumber: string): DocumentValidationResult {
    switch (documentType.toUpperCase()) {
      case 'AADHAR':
        return this.validateAadharNumber(documentNumber);
      case 'PAN':
        return this.validatePANNumber(documentNumber);
      default:
        return {
          isValid: false,
          message: 'Unsupported document type'
        };
    }
  }
  
  // Check if user's KYC is complete and verified
  async isKYCVerified(userId: string): Promise<boolean> {
    try {
      const kycDetails = await prisma.kYCDetail.findUnique({
        where: { userId }
      });
      
      return kycDetails?.kycStatus === KYCStatus.VERIFIED;
    } catch (error) {
      console.error('Error checking KYC verification status:', error);
      return false;
    }
  }
  
  // Check if all required KYC documents are uploaded
  async areAllDocumentsUploaded(userId: string): Promise<boolean> {
    try {
      const kycDetails = await prisma.kYCDetail.findUnique({
        where: { userId },
        include: {
          kycDocuments: true
        }
      });
      
      if (!kycDetails) return false;
      
      // Check for all required documents
      const requiredDocs = {
        'AADHAR': ['front', 'back'],
        'PAN': ['front', 'back'],
        'SELFIE': ['left', 'right', 'center']
      };

      for (const [type, subTypes] of Object.entries(requiredDocs)) {
        for (const subType of subTypes) {
          const hasDoc = kycDetails.kycDocuments.some(
            doc => doc.documentType === type && doc.subType === subType
          );
          if (!hasDoc) return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error checking KYC document completeness:', error);
      return false;
    }
  }
  
  // Get KYC completion percentage
  async getKYCCompletionPercentage(userId: string): Promise<number> {
    try {
      const kycDetails = await prisma.kYCDetail.findUnique({
        where: { userId },
        include: {
          kycDocuments: true
        }
      });
      
      if (!kycDetails) return 0;
      
      let completed = 0;
      const total = 9; // 7 documents + 2 numbers
      
      // Check required documents
      const requiredDocs = {
        'AADHAR': ['front', 'back'],
        'PAN': ['front', 'back'],
        'SELFIE': ['left', 'right', 'center']
      };

      for (const [type, subTypes] of Object.entries(requiredDocs)) {
        for (const subType of subTypes) {
          const hasDoc = kycDetails.kycDocuments.some(
            doc => doc.documentType === type && doc.subType === subType
          );
          if (hasDoc) completed++;
        }
      }
      
      // Check document numbers
      if (kycDetails.aadharNumber) completed++;
      if (kycDetails.panNumber) completed++;
      
      return Math.round((completed / total) * 100);
    } catch (error) {
      console.error('Error calculating KYC completion percentage:', error);
      return 0;
    }
  }
  
  // Get KYC validation errors
  async getKYCValidationErrors(userId: string): Promise<string[]> {
    const errors: string[] = [];
    
    try {
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
        errors.push('KYC process not started');
        return errors;
      }
      
      // Check required documents
      const requiredDocs = {
        'AADHAR': ['front', 'back'],
        'PAN': ['front', 'back'],
        'SELFIE': ['left', 'right', 'center']
      };

      for (const [type, subTypes] of Object.entries(requiredDocs)) {
        for (const subType of subTypes) {
          const hasDoc = kycDetails.kycDocuments.some(
            doc => doc.documentType === type && doc.subType === subType
          );
          if (!hasDoc) {
            errors.push(`${type} ${subType} document not uploaded`);
          }
        }
      }
      
      // Check document numbers
      if (!kycDetails.aadharNumber) {
        errors.push('Aadhar number not provided');
      } else {
        const aadharValidation = this.validateAadharNumber(kycDetails.aadharNumber);
        if (!aadharValidation.isValid) {
          errors.push(`Invalid Aadhar number: ${aadharValidation.message}`);
        }
      }
      
      if (!kycDetails.panNumber) {
        errors.push('PAN number not provided');
      } else {
        const panValidation = this.validatePANNumber(kycDetails.panNumber);
        if (!panValidation.isValid) {
          errors.push(`Invalid PAN number: ${panValidation.message}`);
        }
      }
      
      // Check document expiry
      const aadharDocs = kycDetails.kycDocuments.filter(doc => doc.documentType === 'AADHAR');
      const panDocs = kycDetails.kycDocuments.filter(doc => doc.documentType === 'PAN');
      
      for (const aadharDoc of aadharDocs) {
        if (aadharDoc.document.expiresAt && new Date() > aadharDoc.document.expiresAt) {
          errors.push(`Aadhar document (${aadharDoc.subType}) has expired`);
        }
      }
      
      for (const panDoc of panDocs) {
        if (panDoc.document.expiresAt && new Date() > panDoc.document.expiresAt) {
          errors.push(`PAN document (${panDoc.subType}) has expired`);
        }
      }
      
    } catch (error) {
      console.error('Error validating KYC:', error);
      errors.push('Error validating KYC details');
    }
    
    return errors;
  }
  
  // Auto-update KYC status based on completion
  async updateKYCStatusBasedOnCompletion(userId: string): Promise<KYCStatus> {
    try {
      const kycDetails = await prisma.kYCDetail.findUnique({
        where: { userId },
        include: {
          kycDocuments: true
        }
      });
      
      if (!kycDetails) {
        throw new Error('KYC details not found');
      }
      
      let newStatus = kycDetails.kycStatus;
      
      // Check if all required documents are uploaded
      const allDocsUploaded = await this.areAllDocumentsUploaded(userId);
      
      // If all documents and numbers are provided, move to pending verification
      if (allDocsUploaded &&
          kycDetails.aadharNumber &&
          kycDetails.panNumber &&
          kycDetails.kycStatus === KYCStatus.INCOMPLETE) {
        newStatus = KYCStatus.PENDING_VERIFICATION;
        
        await prisma.kYCDetail.update({
          where: { userId },
          data: { kycStatus: newStatus }
        });
      }
      
      return newStatus;
    } catch (error) {
      console.error('Error updating KYC status:', error);
      throw error;
    }
  }
  
  // Generate KYC summary for user
  async getKYCSummary(userId: string) {
    try {
      const kycDetails = await prisma.kYCDetail.findUnique({
        where: { userId },
        include: {
          kycDocuments: {
            include: {
              document: true
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true
            }
          }
        }
      });
      
      if (!kycDetails) {
        return {
          status: 'NOT_STARTED',
          completionPercentage: 0,
          errors: ['KYC process not started'],
          canProceedWithLoan: false
        };
      }
      
      const completionPercentage = await this.getKYCCompletionPercentage(userId);
      const errors = await this.getKYCValidationErrors(userId);
      const isVerified = kycDetails.kycStatus === KYCStatus.VERIFIED;
      const canProceedWithLoan = isVerified && errors.length === 0;
      
      return {
        status: kycDetails.kycStatus,
        completionPercentage,
        errors,
        canProceedWithLoan,
        documents: {
          aadhar: {
            uploaded: kycDetails.kycDocuments.some(doc => doc.documentType === 'AADHAR'),
            numberProvided: !!kycDetails.aadharNumber,
            verified: kycDetails.aadharVerified,
            front: kycDetails.kycDocuments.find(doc => doc.documentType === 'AADHAR' && doc.subType === 'front'),
            back: kycDetails.kycDocuments.find(doc => doc.documentType === 'AADHAR' && doc.subType === 'back')
          },
          pan: {
            uploaded: kycDetails.kycDocuments.some(doc => doc.documentType === 'PAN'),
            numberProvided: !!kycDetails.panNumber,
            verified: kycDetails.panVerified,
            front: kycDetails.kycDocuments.find(doc => doc.documentType === 'PAN' && doc.subType === 'front'),
            back: kycDetails.kycDocuments.find(doc => doc.documentType === 'PAN' && doc.subType === 'back')
          },
          selfie: {
            uploaded: kycDetails.kycDocuments.some(doc => doc.documentType === 'SELFIE'),
            verified: kycDetails.selfieVerified,
            left: kycDetails.kycDocuments.find(doc => doc.documentType === 'SELFIE' && doc.subType === 'left'),
            right: kycDetails.kycDocuments.find(doc => doc.documentType === 'SELFIE' && doc.subType === 'right'),
            center: kycDetails.kycDocuments.find(doc => doc.documentType === 'SELFIE' && doc.subType === 'center')
          }
        },
        verificationDate: kycDetails.verificationDate,
        rejectionReason: kycDetails.rejectionReason,
        resubmissionAllowed: kycDetails.resubmissionAllowed
      };
    } catch (error) {
      console.error('Error generating KYC summary:', error);
      throw error;
    }
  }
  
  // Private helper methods
  private verifyAadharChecksum(aadharNumber: string): boolean {
    // Simplified Verhoeff algorithm implementation for Aadhar validation
    const verhoeffTable = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
      [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
      [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
      [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
      [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
      [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    ];
    
    const permutationTable = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
      [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
      [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
      [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
      [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
    ];
    
    let checksum = 0;
    const digits = aadharNumber.split('').map(Number).reverse();
    
    for (let i = 0; i < digits.length; i++) {
      checksum = verhoeffTable[checksum][permutationTable[i % 8][digits[i]]];
    }
    
    return checksum === 0;
  }
}