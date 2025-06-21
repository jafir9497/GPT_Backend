const CloudStorageService = require('../services/cloudStorageService');
const DocumentStorageService = require('../services/documentStorageService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class CloudStorageController {
  constructor() {
    this.cloudStorage = new CloudStorageService();
    this.localStorage = new DocumentStorageService();
  }

  // Upload file to cloud storage
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file provided' }
        });
      }

      const { customerId, folder = 'documents', subFolder } = req.body;
      
      // Upload to S3
      const result = await this.cloudStorage.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        folder,
        customerId,
        subFolder,
        {
          uploadedBy: req.user.userId,
          uploadedAt: new Date().toISOString()
        }
      );

      // Save document record in database
      const documentRecord = await prisma.document.create({
        data: {
          customerId: customerId || null,
          documentType: 'UPLOADED',
          documentCategory: folder,
          title: req.file.originalname,
          fileName: req.file.originalname,
          filePath: result.key, // S3 key
          fileSize: result.size,
          mimeType: result.contentType,
          storageType: 'S3',
          storageUrl: result.url,
          metadata: {
            s3Bucket: result.bucket,
            s3Key: result.key,
            s3ETag: result.etag,
            uploadedBy: req.user.userId
          },
          createdBy: req.user.userId,
          isActive: true
        }
      });

      res.json({
        success: true,
        data: {
          documentId: documentRecord.documentId,
          s3Key: result.key,
          url: result.url,
          size: result.size,
          contentType: result.contentType
        },
        message: 'File uploaded to cloud storage successfully'
      });
    } catch (error) {
      console.error('Cloud upload error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to upload file to cloud storage',
          details: error.message
        }
      });
    }
  }

  // Upload multiple files
  async uploadMultipleFiles(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No files provided' }
        });
      }

      const { customerId, folder = 'documents', subFolder } = req.body;
      
      const files = req.files.map(file => ({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype
      }));

      // Batch upload to S3
      const uploadResult = await this.cloudStorage.batchUpload(
        files,
        folder,
        customerId,
        subFolder
      );

      // Save successful uploads to database
      const documentRecords = [];
      for (const result of uploadResult.results) {
        if (result.success) {
          const documentRecord = await prisma.document.create({
            data: {
              customerId: customerId || null,
              documentType: 'UPLOADED',
              documentCategory: folder,
              title: result.file,
              fileName: result.file,
              filePath: result.result.key,
              fileSize: result.result.size,
              mimeType: result.result.contentType,
              storageType: 'S3',
              storageUrl: result.result.url,
              metadata: {
                s3Bucket: result.result.bucket,
                s3Key: result.result.key,
                s3ETag: result.result.etag,
                uploadedBy: req.user.userId,
                batchUpload: true
              },
              createdBy: req.user.userId,
              isActive: true
            }
          });
          documentRecords.push(documentRecord);
        }
      }

      res.json({
        success: true,
        data: {
          summary: uploadResult.summary,
          uploadedDocuments: documentRecords.map(doc => ({
            documentId: doc.documentId,
            fileName: doc.fileName,
            s3Key: doc.filePath,
            url: doc.storageUrl
          })),
          results: uploadResult.results
        },
        message: `Batch upload completed: ${uploadResult.summary.successful} successful, ${uploadResult.summary.failed} failed`
      });
    } catch (error) {
      console.error('Batch cloud upload error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to upload files to cloud storage',
          details: error.message
        }
      });
    }
  }

  // Generate presigned URL for file access
  async generatePresignedUrl(req, res) {
    try {
      const { documentId } = req.params;
      const { expiresIn = 3600 } = req.query;

      // Get document from database
      const document = await prisma.document.findUnique({
        where: { documentId },
        include: { customer: true }
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' }
        });
      }

      // Check access permissions
      if (document.customerId && document.customerId !== req.user.userId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.userType)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied to this document' }
        });
      }

      if (document.storageType !== 'S3') {
        return res.status(400).json({
          success: false,
          error: { message: 'Document is not stored in cloud storage' }
        });
      }

      // Generate presigned URL
      const urlResult = await this.cloudStorage.generatePresignedUrl(
        document.filePath,
        parseInt(expiresIn)
      );

      // Log access
      await prisma.document.update({
        where: { documentId },
        data: {
          downloadCount: { increment: 1 },
          lastAccessed: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          documentId: document.documentId,
          fileName: document.fileName,
          presignedUrl: urlResult.url,
          expiresAt: urlResult.expiresAt,
          expiresIn: urlResult.expiresIn
        },
        message: 'Presigned URL generated successfully'
      });
    } catch (error) {
      console.error('Presigned URL error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate presigned URL',
          details: error.message
        }
      });
    }
  }

  // Generate presigned upload URL for direct client uploads
  async generatePresignedUploadUrl(req, res) {
    try {
      const { fileName, contentType, folder = 'documents', customerId, subFolder } = req.body;

      if (!fileName || !contentType) {
        return res.status(400).json({
          success: false,
          error: { message: 'File name and content type are required' }
        });
      }

      // Generate S3 key
      const s3Key = this.cloudStorage.generateS3Key(folder, fileName, customerId, subFolder);

      // Generate presigned upload URL
      const uploadResult = await this.cloudStorage.generatePresignedUploadUrl(
        s3Key,
        contentType,
        3600, // 1 hour expiry
        {
          uploadedBy: req.user.userId,
          directUpload: 'true'
        }
      );

      res.json({
        success: true,
        data: {
          uploadUrl: uploadResult.uploadUrl,
          s3Key: uploadResult.key,
          expiresAt: uploadResult.expiresAt,
          fields: uploadResult.fields
        },
        message: 'Presigned upload URL generated successfully'
      });
    } catch (error) {
      console.error('Presigned upload URL error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate presigned upload URL',
          details: error.message
        }
      });
    }
  }

  // Confirm direct upload and create document record
  async confirmDirectUpload(req, res) {
    try {
      const { s3Key, fileName, fileSize, contentType, customerId, folder = 'documents' } = req.body;

      if (!s3Key || !fileName) {
        return res.status(400).json({
          success: false,
          error: { message: 'S3 key and file name are required' }
        });
      }

      // Verify file exists in S3
      const metadata = await this.cloudStorage.getFileMetadata(s3Key);
      
      if (!metadata.success) {
        return res.status(404).json({
          success: false,
          error: { message: 'File not found in cloud storage' }
        });
      }

      // Create document record
      const documentRecord = await prisma.document.create({
        data: {
          customerId: customerId || null,
          documentType: 'UPLOADED',
          documentCategory: folder,
          title: fileName,
          fileName: fileName,
          filePath: s3Key,
          fileSize: fileSize || metadata.contentLength,
          mimeType: contentType || metadata.contentType,
          storageType: 'S3',
          storageUrl: `https://${this.cloudStorage.bucketName}.s3.${this.cloudStorage.region}.amazonaws.com/${s3Key}`,
          metadata: {
            s3Bucket: this.cloudStorage.bucketName,
            s3Key: s3Key,
            s3ETag: metadata.etag,
            uploadedBy: req.user.userId,
            directUpload: true
          },
          createdBy: req.user.userId,
          isActive: true
        }
      });

      res.json({
        success: true,
        data: {
          documentId: documentRecord.documentId,
          s3Key: s3Key,
          url: documentRecord.storageUrl,
          size: documentRecord.fileSize,
          contentType: documentRecord.mimeType
        },
        message: 'Direct upload confirmed and document record created'
      });
    } catch (error) {
      console.error('Confirm direct upload error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to confirm direct upload',
          details: error.message
        }
      });
    }
  }

  // Migrate local files to cloud storage
  async migrateToCloud(req, res) {
    try {
      const { documentIds, deleteLocal = false } = req.body;

      if (!documentIds || !Array.isArray(documentIds)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Document IDs array is required' }
        });
      }

      const results = [];
      let migrated = 0;
      let failed = 0;

      for (const documentId of documentIds) {
        try {
          // Get document record
          const document = await prisma.document.findUnique({
            where: { documentId }
          });

          if (!document) {
            results.push({
              documentId,
              success: false,
              error: 'Document not found'
            });
            failed++;
            continue;
          }

          if (document.storageType === 'S3') {
            results.push({
              documentId,
              success: false,
              error: 'Document already in cloud storage'
            });
            failed++;
            continue;
          }

          // Generate S3 key
          const s3Key = this.cloudStorage.generateS3Key(
            document.documentCategory,
            document.fileName,
            document.customerId
          );

          // Upload to S3
          const uploadResult = await this.cloudStorage.syncLocalToS3(
            document.filePath,
            s3Key,
            deleteLocal
          );

          // Update document record
          await prisma.document.update({
            where: { documentId },
            data: {
              filePath: s3Key,
              storageType: 'S3',
              storageUrl: uploadResult.url,
              metadata: {
                ...document.metadata,
                s3Bucket: uploadResult.bucket,
                s3Key: s3Key,
                s3ETag: uploadResult.etag,
                migratedAt: new Date().toISOString(),
                migratedBy: req.user.userId,
                originalLocalPath: document.filePath
              }
            }
          });

          results.push({
            documentId,
            success: true,
            s3Key: s3Key,
            url: uploadResult.url,
            localFileDeleted: uploadResult.localFileDeleted || false
          });
          migrated++;
        } catch (error) {
          results.push({
            documentId,
            success: false,
            error: error.message
          });
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          summary: {
            total: documentIds.length,
            migrated,
            failed
          },
          results
        },
        message: `Migration completed: ${migrated} migrated, ${failed} failed`
      });
    } catch (error) {
      console.error('Migration error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to migrate files to cloud storage',
          details: error.message
        }
      });
    }
  }

  // Delete file from cloud storage
  async deleteFile(req, res) {
    try {
      const { documentId } = req.params;

      // Get document record
      const document = await prisma.document.findUnique({
        where: { documentId }
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' }
        });
      }

      // Check permissions
      if (document.customerId && document.customerId !== req.user.userId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.userType)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied to delete this document' }
        });
      }

      if (document.storageType === 'S3') {
        // Delete from S3
        await this.cloudStorage.deleteFile(document.filePath);
      }

      // Mark document as inactive
      await prisma.document.update({
        where: { documentId },
        data: {
          isActive: false,
          metadata: {
            ...document.metadata,
            deletedAt: new Date().toISOString(),
            deletedBy: req.user.userId
          }
        }
      });

      res.json({
        success: true,
        message: 'File deleted from cloud storage successfully'
      });
    } catch (error) {
      console.error('Cloud delete error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete file from cloud storage',
          details: error.message
        }
      });
    }
  }

  // List files in cloud storage
  async listFiles(req, res) {
    try {
      const { prefix, maxKeys = 100, customerId } = req.query;

      let searchPrefix = prefix;
      if (!searchPrefix && customerId) {
        searchPrefix = `documents/customers/${customerId}/`;
      }

      const listResult = await this.cloudStorage.listFiles(searchPrefix, parseInt(maxKeys));

      res.json({
        success: true,
        data: {
          files: listResult.files,
          count: listResult.count,
          prefix: searchPrefix,
          isTruncated: listResult.isTruncated
        },
        message: 'Files listed successfully'
      });
    } catch (error) {
      console.error('List files error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to list files from cloud storage',
          details: error.message
        }
      });
    }
  }

  // Get cloud storage health status
  async getHealthStatus(req, res) {
    try {
      const healthCheck = await this.cloudStorage.healthCheck();

      res.json({
        success: healthCheck.success,
        data: healthCheck,
        message: healthCheck.success ? 'Cloud storage is healthy' : 'Cloud storage is not available'
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to check cloud storage health',
          details: error.message
        }
      });
    }
  }

  // Get storage statistics
  async getStorageStats(req, res) {
    try {
      // Get document statistics from database
      const [
        totalDocuments,
        cloudDocuments,
        localDocuments,
        storageByType,
        recentUploads
      ] = await Promise.all([
        prisma.document.count({ where: { isActive: true } }),
        prisma.document.count({ where: { isActive: true, storageType: 'S3' } }),
        prisma.document.count({ where: { isActive: true, storageType: 'LOCAL' } }),
        prisma.document.groupBy({
          by: ['storageType'],
          where: { isActive: true },
          _count: true,
          _sum: { fileSize: true }
        }),
        prisma.document.findMany({
          where: { isActive: true, storageType: 'S3' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            documentId: true,
            fileName: true,
            fileSize: true,
            createdAt: true,
            documentCategory: true
          }
        })
      ]);

      const totalSize = storageByType.reduce((sum, item) => sum + (parseInt(item._sum.fileSize) || 0), 0);
      const cloudSize = storageByType.find(item => item.storageType === 'S3')?._sum.fileSize || 0;

      res.json({
        success: true,
        data: {
          summary: {
            totalDocuments,
            cloudDocuments,
            localDocuments,
            totalSize,
            cloudSize: parseInt(cloudSize),
            cloudPercentage: totalDocuments > 0 ? Math.round((cloudDocuments / totalDocuments) * 100) : 0
          },
          storageBreakdown: storageByType.map(item => ({
            storageType: item.storageType,
            count: item._count,
            totalSize: parseInt(item._sum.fileSize) || 0
          })),
          recentUploads
        },
        message: 'Storage statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Storage stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get storage statistics',
          details: error.message
        }
      });
    }
  }
}

module.exports = new CloudStorageController();