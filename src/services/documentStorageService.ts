import fs from 'fs/promises';
import path from 'path';
import { mkdir } from 'fs/promises';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface DocumentMetadata {
  documentId: string;
  originalName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category: DocumentCategory;
  subCategory?: string;
  tags?: string[];
  uploadedBy: string;
  uploadedAt: Date;
  relatedEntityId: string; // Customer ID, Loan ID, etc.
  relatedEntityType: EntityType;
  accessPermissions: AccessPermission[];
  version: number;
  parentDocumentId?: string;
  expiryDate?: Date;
  isActive: boolean;
  checksum: string;
}

export interface AccessPermission {
  userId: string;
  userType: UserType;
  permission: PermissionType;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface DocumentSearchParams {
  customerId?: string;
  loanId?: string;
  category?: DocumentCategory;
  subCategory?: string;
  tags?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  uploadedBy?: string;
  isActive?: boolean;
  hasAccess?: {
    userId: string;
    userType: UserType;
  };
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    documentId: string;
    error: string;
  }>;
  totalProcessed: number;
}

export enum DocumentCategory {
  // Loan Documentation
  LOAN_AGREEMENT = 'loan_agreement',
  LOAN_STATEMENT = 'loan_statement',
  
  // Payment Documentation
  PAYMENT_RECEIPT = 'payment_receipt',
  PAYMENT_PROOF = 'payment_proof',
  
  // Gold Documentation
  GOLD_APPRAISAL = 'gold_appraisal',
  GOLD_PHOTOS = 'gold_photos',
  GOLD_CERTIFICATE = 'gold_certificate',
  GOLD_RELEASE = 'gold_release',
  
  // KYC Documentation
  AADHAAR = 'aadhaar',
  PAN = 'pan',
  PASSPORT = 'passport',
  DRIVING_LICENSE = 'driving_license',
  VOTER_ID = 'voter_id',
  BANK_STATEMENT = 'bank_statement',
  
  // Identity Documentation
  CUSTOMER_PHOTO = 'customer_photo',
  SIGNATURE = 'signature',
  
  // Legal Documentation
  LEGAL_AGREEMENT = 'legal_agreement',
  COURT_ORDER = 'court_order',
  LEGAL_NOTICE = 'legal_notice',
  
  // Compliance Documentation
  AUDIT_REPORT = 'audit_report',
  COMPLIANCE_CERTIFICATE = 'compliance_certificate',
  
  // Communication
  EMAIL = 'email',
  SMS = 'sms',
  NOTIFICATION = 'notification',
  
  // Reports
  SYSTEM_REPORT = 'system_report',
  BUSINESS_REPORT = 'business_report',
  
  // Other
  MISCELLANEOUS = 'miscellaneous',
  GENERATED = 'generated',
}

export enum EntityType {
  CUSTOMER = 'customer',
  LOAN = 'loan',
  PAYMENT = 'payment',
  EMPLOYEE = 'employee',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

export enum UserType {
  CUSTOMER = 'customer',
  EMPLOYEE = 'employee',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  SYSTEM = 'system',
}

export enum PermissionType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  SHARE = 'share',
  ADMIN = 'admin',
}

export class DocumentStorageService {
  private basePath: string;
  private maxFileSize: number;
  private allowedMimeTypes: Set<string>;

  constructor(
    basePath: string = './documents',
    maxFileSize: number = 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: string[] = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]
  ) {
    this.basePath = basePath;
    this.maxFileSize = maxFileSize;
    this.allowedMimeTypes = new Set(allowedMimeTypes);
  }

  /**
   * Initialize document storage with PRD-specified folder structure
   */
  async initializeStorage(): Promise<void> {
    const folders = [
      // Customer folders
      'customers',
      
      // Employee folders
      'employees',
      
      // Template folders
      'templates/agreements',
      'templates/receipts',
      'templates/statements',
      'templates/reports',
      'templates/certificates',
      
      // System folders
      'system/backups',
      'system/logs',
      'system/exports',
      'system/imports',
      'system/temp',
      
      // Compliance folders
      'compliance/audit',
      'compliance/legal',
      'compliance/regulatory',
      
      // Reports folders
      'reports/daily',
      'reports/monthly',
      'reports/quarterly',
      'reports/annual',
      'reports/custom',
    ];

    for (const folder of folders) {
      const folderPath = path.join(this.basePath, folder);
      await this.ensureDirectoryExists(folderPath);
    }
  }

  /**
   * Get customer-specific folder structure
   */
  private getCustomerFolderStructure(customerId: string): string[] {
    return [
      `customers/${customerId}`,
      `customers/${customerId}/kyc`,
      `customers/${customerId}/kyc/aadhaar`,
      `customers/${customerId}/kyc/pan`,
      `customers/${customerId}/kyc/photos`,
      `customers/${customerId}/kyc/bank_statements`,
      `customers/${customerId}/loans`,
      `customers/${customerId}/communications`,
      `customers/${customerId}/reports`,
    ];
  }

  /**
   * Get loan-specific folder structure
   */
  private getLoanFolderStructure(customerId: string, loanId: string): string[] {
    return [
      `customers/${customerId}/loans/${loanId}`,
      `customers/${customerId}/loans/${loanId}/agreements`,
      `customers/${customerId}/loans/${loanId}/statements`,
      `customers/${customerId}/loans/${loanId}/receipts`,
      `customers/${customerId}/loans/${loanId}/gold_photos`,
      `customers/${customerId}/loans/${loanId}/gold_certificates`,
      `customers/${customerId}/loans/${loanId}/valuations`,
      `customers/${customerId}/loans/${loanId}/legal`,
      `customers/${customerId}/loans/${loanId}/payments`,
    ];
  }

  /**
   * Get employee-specific folder structure
   */
  private getEmployeeFolderStructure(employeeId: string): string[] {
    return [
      `employees/${employeeId}`,
      `employees/${employeeId}/profile_docs`,
      `employees/${employeeId}/signatures`,
      `employees/${employeeId}/assignments`,
      `employees/${employeeId}/reports`,
    ];
  }

  /**
   * Store document with proper folder structure
   */
  async storeDocument(
    buffer: Buffer,
    metadata: Omit<DocumentMetadata, 'documentId' | 'filePath' | 'fileSize' | 'checksum' | 'uploadedAt' | 'version' | 'isActive'>
  ): Promise<DocumentMetadata> {
    // Validate file
    this.validateFile(buffer, metadata.mimeType);

    // Generate document ID and file name
    const documentId = this.generateDocumentId();
    const fileName = this.generateFileName(metadata.originalName, documentId);
    
    // Determine storage path based on category and entity
    const storagePath = this.getStoragePath(
      metadata.category,
      metadata.relatedEntityType,
      metadata.relatedEntityId,
      fileName
    );

    // Ensure directory exists
    await this.ensureDirectoryExists(path.dirname(storagePath));

    // Calculate checksum
    const checksum = this.calculateChecksum(buffer);

    // Write file
    await fs.writeFile(storagePath, buffer);

    // Create metadata
    const documentMetadata: DocumentMetadata = {
      ...metadata,
      documentId,
      fileName,
      filePath: storagePath,
      fileSize: buffer.length,
      checksum,
      uploadedAt: new Date(),
      version: 1,
      isActive: true,
    };

    return documentMetadata;
  }

  /**
   * Retrieve document
   */
  async retrieveDocument(documentId: string, userId: string, userType: UserType): Promise<{
    buffer: Buffer;
    metadata: DocumentMetadata;
  }> {
    // Get metadata from database (implementation would query database)
    const metadata = await this.getDocumentMetadata(documentId);
    
    if (!metadata) {
      throw new Error('Document not found');
    }

    // Check access permissions
    if (!this.hasAccess(metadata, userId, userType, PermissionType.READ)) {
      throw new Error('Access denied');
    }

    // Verify file integrity
    const buffer = await fs.readFile(metadata.filePath);
    const checksum = this.calculateChecksum(buffer);
    
    if (checksum !== metadata.checksum) {
      throw new Error('Document integrity check failed');
    }

    return { buffer, metadata };
  }

  /**
   * Update document (create new version)
   */
  async updateDocument(
    documentId: string,
    buffer: Buffer,
    updatedBy: string,
    userType: UserType,
    updateMetadata?: Partial<DocumentMetadata>
  ): Promise<DocumentMetadata> {
    const existingMetadata = await this.getDocumentMetadata(documentId);
    
    if (!existingMetadata) {
      throw new Error('Document not found');
    }

    // Check write permission
    if (!this.hasAccess(existingMetadata, updatedBy, userType, PermissionType.WRITE)) {
      throw new Error('Access denied');
    }

    // Validate new file
    this.validateFile(buffer, existingMetadata.mimeType);

    // Generate new version
    const newVersion = existingMetadata.version + 1;
    const newFileName = this.generateVersionedFileName(
      existingMetadata.originalName,
      documentId,
      newVersion
    );

    // Create new file path
    const newStoragePath = path.join(
      path.dirname(existingMetadata.filePath),
      newFileName
    );

    // Calculate checksum
    const checksum = this.calculateChecksum(buffer);

    // Write new version
    await fs.writeFile(newStoragePath, buffer);

    // Update metadata
    const updatedMetadata: DocumentMetadata = {
      ...existingMetadata,
      ...updateMetadata,
      fileName: newFileName,
      filePath: newStoragePath,
      fileSize: buffer.length,
      checksum,
      uploadedAt: new Date(),
      version: newVersion,
      parentDocumentId: documentId,
    };

    return updatedMetadata;
  }

  /**
   * Delete document (soft delete)
   */
  async deleteDocument(
    documentId: string,
    deletedBy: string,
    userType: UserType,
    hardDelete: boolean = false
  ): Promise<void> {
    const metadata = await this.getDocumentMetadata(documentId);
    
    if (!metadata) {
      throw new Error('Document not found');
    }

    // Check delete permission
    if (!this.hasAccess(metadata, deletedBy, userType, PermissionType.DELETE)) {
      throw new Error('Access denied');
    }

    if (hardDelete) {
      // Permanently delete file
      await fs.unlink(metadata.filePath);
      // Remove from database (implementation would delete from database)
    } else {
      // Soft delete - mark as inactive
      // Implementation would update database to set isActive = false
    }
  }

  /**
   * Search documents
   */
  async searchDocuments(params: DocumentSearchParams): Promise<DocumentMetadata[]> {
    // Implementation would query database with search parameters
    // This is a placeholder for the actual database query
    return [];
  }

  /**
   * Bulk operations
   */
  async bulkDelete(
    documentIds: string[],
    deletedBy: string,
    userType: UserType
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      totalProcessed: documentIds.length,
    };

    for (const documentId of documentIds) {
      try {
        await this.deleteDocument(documentId, deletedBy, userType);
        result.successful.push(documentId);
      } catch (error: any) {
        result.failed.push({
          documentId,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * Archive old documents
   */
  async archiveDocuments(
    olderThanDays: number,
    categories?: DocumentCategory[]
  ): Promise<BulkOperationResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Implementation would query database for old documents
    // and move them to archive folder
    
    return {
      successful: [],
      failed: [],
      totalProcessed: 0,
    };
  }

  /**
   * Generate storage statistics
   */
  async getStorageStatistics(): Promise<{
    totalDocuments: number;
    totalSize: number;
    categoryBreakdown: Record<DocumentCategory, { count: number; size: number }>;
    oldestDocument: Date;
    newestDocument: Date;
    averageFileSize: number;
  }> {
    // Implementation would aggregate data from database
    return {
      totalDocuments: 0,
      totalSize: 0,
      categoryBreakdown: {} as any,
      oldestDocument: new Date(),
      newestDocument: new Date(),
      averageFileSize: 0,
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<number> {
    const tempDir = path.join(this.basePath, 'system/temp');
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    let deletedCount = 0;

    try {
      const files = await fs.readdir(tempDir);
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }

    return deletedCount;
  }

  // Private helper methods

  private validateFile(buffer: Buffer, mimeType: string): void {
    if (buffer.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }

    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }
  }

  private generateDocumentId(): string {
    return crypto.randomUUID();
  }

  private generateFileName(originalName: string, documentId: string): string {
    const extension = path.extname(originalName);
    const timestamp = Date.now();
    return `${documentId}_${timestamp}${extension}`;
  }

  private generateVersionedFileName(
    originalName: string,
    documentId: string,
    version: number
  ): string {
    const extension = path.extname(originalName);
    const timestamp = Date.now();
    return `${documentId}_v${version}_${timestamp}${extension}`;
  }

  private getStoragePath(
    category: DocumentCategory,
    entityType: EntityType,
    entityId: string,
    fileName: string
  ): string {
    let relativePath: string;

    switch (entityType) {
      case EntityType.CUSTOMER:
        relativePath = this.getCustomerDocumentPath(category, entityId, fileName);
        break;
      case EntityType.LOAN:
        // For loan documents, we need both customer and loan ID
        // This would be passed in metadata or derived from loan ID
        relativePath = this.getLoanDocumentPath(category, entityId, fileName);
        break;
      case EntityType.EMPLOYEE:
        relativePath = this.getEmployeeDocumentPath(category, entityId, fileName);
        break;
      case EntityType.SYSTEM:
        relativePath = this.getSystemDocumentPath(category, fileName);
        break;
      default:
        relativePath = path.join('miscellaneous', fileName);
    }

    return path.join(this.basePath, relativePath);
  }

  private getCustomerDocumentPath(
    category: DocumentCategory,
    customerId: string,
    fileName: string
  ): string {
    const categoryMap: Record<DocumentCategory, string> = {
      [DocumentCategory.AADHAAR]: `customers/${customerId}/kyc/aadhaar`,
      [DocumentCategory.PAN]: `customers/${customerId}/kyc/pan`,
      [DocumentCategory.CUSTOMER_PHOTO]: `customers/${customerId}/kyc/photos`,
      [DocumentCategory.BANK_STATEMENT]: `customers/${customerId}/kyc/bank_statements`,
      [DocumentCategory.EMAIL]: `customers/${customerId}/communications`,
      [DocumentCategory.SMS]: `customers/${customerId}/communications`,
      [DocumentCategory.SYSTEM_REPORT]: `customers/${customerId}/reports`,
      // Default to main customer folder
      [DocumentCategory.MISCELLANEOUS]: `customers/${customerId}`,
    } as Record<DocumentCategory, string>;

    const folder = categoryMap[category] || `customers/${customerId}`;
    return path.join(folder, fileName);
  }

  private getLoanDocumentPath(
    category: DocumentCategory,
    loanId: string,
    fileName: string
  ): string {
    // Implementation would get customer ID from loan ID
    // For now, using placeholder
    const customerId = 'placeholder'; // This would be fetched from database
    
    const categoryMap: Record<DocumentCategory, string> = {
      [DocumentCategory.LOAN_AGREEMENT]: `customers/${customerId}/loans/${loanId}/agreements`,
      [DocumentCategory.LOAN_STATEMENT]: `customers/${customerId}/loans/${loanId}/statements`,
      [DocumentCategory.PAYMENT_RECEIPT]: `customers/${customerId}/loans/${loanId}/payments`,
      [DocumentCategory.GOLD_PHOTOS]: `customers/${customerId}/loans/${loanId}/gold_photos`,
      [DocumentCategory.GOLD_CERTIFICATE]: `customers/${customerId}/loans/${loanId}/gold_certificates`,
      [DocumentCategory.GOLD_APPRAISAL]: `customers/${customerId}/loans/${loanId}/valuations`,
      [DocumentCategory.LEGAL_AGREEMENT]: `customers/${customerId}/loans/${loanId}/legal`,
    } as Record<DocumentCategory, string>;

    const folder = categoryMap[category] || `customers/${customerId}/loans/${loanId}`;
    return path.join(folder, fileName);
  }

  private getEmployeeDocumentPath(
    category: DocumentCategory,
    employeeId: string,
    fileName: string
  ): string {
    const categoryMap: Record<DocumentCategory, string> = {
      [DocumentCategory.SIGNATURE]: `employees/${employeeId}/signatures`,
      [DocumentCategory.SYSTEM_REPORT]: `employees/${employeeId}/reports`,
    } as Record<DocumentCategory, string>;

    const folder = categoryMap[category] || `employees/${employeeId}/profile_docs`;
    return path.join(folder, fileName);
  }

  private getSystemDocumentPath(category: DocumentCategory, fileName: string): string {
    const categoryMap: Record<DocumentCategory, string> = {
      [DocumentCategory.SYSTEM_REPORT]: 'system/reports',
      [DocumentCategory.AUDIT_REPORT]: 'compliance/audit',
      [DocumentCategory.LEGAL_AGREEMENT]: 'compliance/legal',
    } as Record<DocumentCategory, string>;

    const folder = categoryMap[category] || 'system';
    return path.join(folder, fileName);
  }

  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private hasAccess(
    metadata: DocumentMetadata,
    userId: string,
    userType: UserType,
    requiredPermission: PermissionType
  ): boolean {
    // Check if user is the owner
    if (metadata.uploadedBy === userId) {
      return true;
    }

    // Check if user has admin privileges
    if (userType === UserType.SUPER_ADMIN || userType === UserType.ADMIN) {
      return true;
    }

    // Check specific permissions
    const userPermission = metadata.accessPermissions.find(
      p => p.userId === userId && p.userType === userType
    );

    if (!userPermission) {
      return false;
    }

    // Check if permission has expired
    if (userPermission.expiresAt && userPermission.expiresAt < new Date()) {
      return false;
    }

    // Check permission level
    const permissionHierarchy = {
      [PermissionType.READ]: 1,
      [PermissionType.WRITE]: 2,
      [PermissionType.DELETE]: 3,
      [PermissionType.SHARE]: 2,
      [PermissionType.ADMIN]: 4,
    };

    const userPermissionLevel = permissionHierarchy[userPermission.permission];
    const requiredPermissionLevel = permissionHierarchy[requiredPermission];

    return userPermissionLevel >= requiredPermissionLevel;
  }

  private async getDocumentMetadata(documentId: string): Promise<DocumentMetadata | null> {
    // Implementation would query database
    // This is a placeholder
    return null;
  }

  /**
   * Save file to storage system
   * @param buffer File buffer
   * @param fileName File name
   * @param entityType Entity type (customer, loan, etc.)
   * @param entityId Entity ID
   * @param category Document category
   * @param uploadedBy User ID who uploaded
   * @returns File path where document was saved
   */
  async saveFile(
    buffer: Buffer,
    fileName: string,
    entityType: EntityType,
    entityId: string,
    category: DocumentCategory,
    uploadedBy?: string
  ): Promise<string> {
    try {
      // Generate storage path
      const storagePath = this.getStoragePath(category, entityType, entityId, fileName);
      
      // Ensure directory exists
      await this.ensureDirectoryExists(path.dirname(storagePath));
      
      // Write file to storage
      await fs.writeFile(storagePath, buffer);
      
      return storagePath;
    } catch (error) {
      logger.error('Error saving file:', error);
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}