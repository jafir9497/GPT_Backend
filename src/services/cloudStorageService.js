const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs').promises;

class CloudStorageService {
  constructor() {
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      // Add endpoint configuration for S3-compatible services if needed
      ...(process.env.AWS_S3_ENDPOINT && {
        endpoint: process.env.AWS_S3_ENDPOINT,
        forcePathStyle: true
      })
    });

    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'gpt-gold-loan-documents';
    this.region = process.env.AWS_REGION || 'us-east-1';
    
    // Configure allowed file types and sizes
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB default
  }

  // Generate S3 key with organized folder structure
  generateS3Key(folder, filename, customerId = null, subFolder = null) {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    let key = `${folder}/`;
    
    if (customerId) {
      key += `customers/${customerId}/`;
    }
    
    if (subFolder) {
      key += `${subFolder}/`;
    }
    
    key += `${timestamp}/${sanitizedFilename}`;
    
    return key;
  }

  // Upload file to S3
  async uploadFile(fileBuffer, filename, mimeType, folder, customerId = null, subFolder = null, metadata = {}) {
    try {
      if (!this.allowedMimeTypes.includes(mimeType)) {
        throw new Error(`File type ${mimeType} is not allowed`);
      }

      if (fileBuffer.length > this.maxFileSize) {
        throw new Error(`File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`);
      }

      const key = this.generateS3Key(folder, filename, customerId, subFolder);
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          originalName: filename
        },
        // Set appropriate storage class
        StorageClass: 'STANDARD',
        // Enable server-side encryption
        ServerSideEncryption: 'AES256'
      };

      const command = new PutObjectCommand(uploadParams);
      const result = await this.s3Client.send(command);

      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      
      return {
        success: true,
        key: key,
        url: fileUrl,
        bucket: this.bucketName,
        etag: result.ETag,
        size: fileBuffer.length,
        contentType: mimeType,
        metadata: uploadParams.Metadata
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  // Upload file from local filesystem to S3
  async uploadFileFromLocal(localFilePath, s3Key, mimeType, metadata = {}) {
    try {
      const fileBuffer = await fs.readFile(localFilePath);
      const filename = path.basename(localFilePath);
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          originalPath: localFilePath,
          originalName: filename
        },
        StorageClass: 'STANDARD',
        ServerSideEncryption: 'AES256'
      };

      const command = new PutObjectCommand(uploadParams);
      const result = await this.s3Client.send(command);

      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
      
      return {
        success: true,
        key: s3Key,
        url: fileUrl,
        bucket: this.bucketName,
        etag: result.ETag,
        size: fileBuffer.length,
        contentType: mimeType
      };
    } catch (error) {
      console.error('S3 upload from local error:', error);
      throw new Error(`Failed to upload file from local to S3: ${error.message}`);
    }
  }

  // Download file from S3
  async downloadFile(key) {
    try {
      const downloadParams = {
        Bucket: this.bucketName,
        Key: key
      };

      const command = new GetObjectCommand(downloadParams);
      const result = await this.s3Client.send(command);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      return {
        success: true,
        buffer: fileBuffer,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata
      };
    } catch (error) {
      console.error('S3 download error:', error);
      throw new Error(`Failed to download file from S3: ${error.message}`);
    }
  }

  // Generate presigned URL for secure access
  async generatePresignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      return {
        success: true,
        url: signedUrl,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
    } catch (error) {
      console.error('S3 presigned URL error:', error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  // Generate presigned URL for upload (for direct frontend uploads)
  async generatePresignedUploadUrl(key, contentType, expiresIn = 3600, metadata = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        },
        ServerSideEncryption: 'AES256'
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      return {
        success: true,
        uploadUrl: signedUrl,
        key: key,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        fields: {
          'Content-Type': contentType,
          'x-amz-server-side-encryption': 'AES256'
        }
      };
    } catch (error) {
      console.error('S3 presigned upload URL error:', error);
      throw new Error(`Failed to generate presigned upload URL: ${error.message}`);
    }
  }

  // Delete file from S3
  async deleteFile(key) {
    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Key: key
      };

      const command = new DeleteObjectCommand(deleteParams);
      await this.s3Client.send(command);

      return {
        success: true,
        key: key,
        message: 'File deleted successfully'
      };
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  // List files in S3 folder
  async listFiles(prefix, maxKeys = 1000) {
    try {
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const command = new ListObjectsV2Command(listParams);
      const result = await this.s3Client.send(command);

      const files = (result.Contents || []).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
        storageClass: obj.StorageClass,
        url: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${obj.Key}`
      }));

      return {
        success: true,
        files: files,
        count: files.length,
        isTruncated: result.IsTruncated,
        nextContinuationToken: result.NextContinuationToken
      };
    } catch (error) {
      console.error('S3 list error:', error);
      throw new Error(`Failed to list files from S3: ${error.message}`);
    }
  }

  // Get file metadata
  async getFileMetadata(key) {
    try {
      const headParams = {
        Bucket: this.bucketName,
        Key: key
      };

      const command = new HeadObjectCommand(headParams);
      const result = await this.s3Client.send(command);

      return {
        success: true,
        key: key,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata,
        storageClass: result.StorageClass,
        serverSideEncryption: result.ServerSideEncryption
      };
    } catch (error) {
      console.error('S3 head object error:', error);
      throw new Error(`Failed to get file metadata from S3: ${error.message}`);
    }
  }

  // Move file within S3 (copy and delete)
  async moveFile(sourceKey, destinationKey) {
    try {
      // First copy the file
      const copyParams = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
        ServerSideEncryption: 'AES256'
      };

      const copyCommand = new PutObjectCommand(copyParams);
      await this.s3Client.send(copyCommand);

      // Then delete the original
      await this.deleteFile(sourceKey);

      return {
        success: true,
        sourceKey: sourceKey,
        destinationKey: destinationKey,
        message: 'File moved successfully'
      };
    } catch (error) {
      console.error('S3 move error:', error);
      throw new Error(`Failed to move file in S3: ${error.message}`);
    }
  }

  // Configure multer for S3 uploads
  getMulterS3Config(folder, customerId = null, subFolder = null) {
    return multer({
      storage: multerS3({
        s3: this.s3Client,
        bucket: this.bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
          const key = this.generateS3Key(folder, file.originalname, customerId, subFolder);
          cb(null, key);
        },
        metadata: (req, file, cb) => {
          cb(null, {
            uploadedAt: new Date().toISOString(),
            originalName: file.originalname,
            userId: req.user?.userId || 'unknown'
          });
        }
      }),
      fileFilter: (req, file, cb) => {
        if (this.allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} is not allowed`), false);
        }
      },
      limits: {
        fileSize: this.maxFileSize
      }
    });
  }

  // Sync local file to S3 and optionally delete local
  async syncLocalToS3(localFilePath, s3Key, deleteLocal = false) {
    try {
      const stats = await fs.stat(localFilePath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const mimeType = this.getMimeTypeFromExtension(path.extname(localFilePath));
      const result = await this.uploadFileFromLocal(localFilePath, s3Key, mimeType);

      if (deleteLocal && result.success) {
        await fs.unlink(localFilePath);
        result.localFileDeleted = true;
      }

      return result;
    } catch (error) {
      console.error('Sync local to S3 error:', error);
      throw new Error(`Failed to sync local file to S3: ${error.message}`);
    }
  }

  // Helper method to get MIME type from file extension
  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  // Batch upload multiple files
  async batchUpload(files, folder, customerId = null, subFolder = null) {
    try {
      const results = [];
      const total = files.length;
      let processed = 0;

      for (const file of files) {
        try {
          const result = await this.uploadFile(
            file.buffer,
            file.filename,
            file.mimetype,
            folder,
            customerId,
            subFolder,
            { batchUpload: true, batchId: Date.now() }
          );
          results.push({ success: true, file: file.filename, result });
        } catch (error) {
          results.push({ success: false, file: file.filename, error: error.message });
        }
        
        processed++;
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        success: true,
        summary: { total, successful, failed },
        results
      };
    } catch (error) {
      console.error('Batch upload error:', error);
      throw new Error(`Batch upload failed: ${error.message}`);
    }
  }

  // Check if S3 service is available
  async healthCheck() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      });
      
      await this.s3Client.send(command);
      
      return {
        success: true,
        service: 'S3',
        bucket: this.bucketName,
        region: this.region,
        status: 'healthy'
      };
    } catch (error) {
      return {
        success: false,
        service: 'S3',
        bucket: this.bucketName,
        region: this.region,
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = CloudStorageService;