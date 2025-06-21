const express = require('express');
const router = express.Router();
const cloudStorageController = require('../controllers/cloudStorageController');
const authMiddleware = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');
const CloudStorageService = require('../services/cloudStorageService');

// Apply authentication to all cloud storage routes
router.use(authMiddleware);

// Initialize cloud storage service for multer configuration
const cloudStorage = new CloudStorageService();

/**
 * @swagger
 * /api/v1/cloud-storage/upload:
 *   post:
 *     summary: Upload file to cloud storage
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               customerId:
 *                 type: string
 *               folder:
 *                 type: string
 *               subFolder:
 *                 type: string
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     documentId:
 *                       type: string
 *                     s3Key:
 *                       type: string
 *                     url:
 *                       type: string
 *                     size:
 *                       type: integer
 *                     contentType:
 *                       type: string
 */
router.post('/upload', 
  cloudStorage.getMulterS3Config('documents').single('file'),
  cloudStorageController.uploadFile
);

/**
 * @swagger
 * /api/v1/cloud-storage/upload-multiple:
 *   post:
 *     summary: Upload multiple files to cloud storage
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               customerId:
 *                 type: string
 *               folder:
 *                 type: string
 *               subFolder:
 *                 type: string
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 */
router.post('/upload-multiple',
  cloudStorage.getMulterS3Config('documents').array('files', 10),
  cloudStorageController.uploadMultipleFiles
);

/**
 * @swagger
 * /api/v1/cloud-storage/presigned-url/{documentId}:
 *   get:
 *     summary: Generate presigned URL for file access
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *       - in: query
 *         name: expiresIn
 *         schema:
 *           type: integer
 *         description: URL expiry time in seconds
 *     responses:
 *       200:
 *         description: Presigned URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     presignedUrl:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                     expiresIn:
 *                       type: integer
 */
router.get('/presigned-url/:documentId', cloudStorageController.generatePresignedUrl);

/**
 * @swagger
 * /api/v1/cloud-storage/presigned-upload-url:
 *   post:
 *     summary: Generate presigned URL for direct client upload
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *               contentType:
 *                 type: string
 *               folder:
 *                 type: string
 *               customerId:
 *                 type: string
 *               subFolder:
 *                 type: string
 *             required: [fileName, contentType]
 *     responses:
 *       200:
 *         description: Presigned upload URL generated successfully
 */
router.post('/presigned-upload-url', cloudStorageController.generatePresignedUploadUrl);

/**
 * @swagger
 * /api/v1/cloud-storage/confirm-upload:
 *   post:
 *     summary: Confirm direct upload and create document record
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               s3Key:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileSize:
 *                 type: integer
 *               contentType:
 *                 type: string
 *               customerId:
 *                 type: string
 *               folder:
 *                 type: string
 *             required: [s3Key, fileName]
 *     responses:
 *       200:
 *         description: Direct upload confirmed successfully
 */
router.post('/confirm-upload', cloudStorageController.confirmDirectUpload);

/**
 * @swagger
 * /api/v1/cloud-storage/migrate:
 *   post:
 *     summary: Migrate local files to cloud storage
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               deleteLocal:
 *                 type: boolean
 *             required: [documentIds]
 *     responses:
 *       200:
 *         description: Migration completed successfully
 */
router.post('/migrate', checkRole(['ADMIN', 'SUPER_ADMIN']), cloudStorageController.migrateToCloud);

/**
 * @swagger
 * /api/v1/cloud-storage/delete/{documentId}:
 *   delete:
 *     summary: Delete file from cloud storage
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: File deleted successfully
 */
router.delete('/delete/:documentId', cloudStorageController.deleteFile);

/**
 * @swagger
 * /api/v1/cloud-storage/list:
 *   get:
 *     summary: List files in cloud storage
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: S3 prefix to filter files
 *       - in: query
 *         name: maxKeys
 *         schema:
 *           type: integer
 *         description: Maximum number of files to return
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Customer ID to filter files
 *     responses:
 *       200:
 *         description: Files listed successfully
 */
router.get('/list', checkRole(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), cloudStorageController.listFiles);

/**
 * @swagger
 * /api/v1/cloud-storage/health:
 *   get:
 *     summary: Get cloud storage health status
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     service:
 *                       type: string
 *                     bucket:
 *                       type: string
 *                     region:
 *                       type: string
 *                     status:
 *                       type: string
 */
router.get('/health', checkRole(['ADMIN', 'SUPER_ADMIN']), cloudStorageController.getHealthStatus);

/**
 * @swagger
 * /api/v1/cloud-storage/stats:
 *   get:
 *     summary: Get storage statistics
 *     tags: [Cloud Storage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                     storageBreakdown:
 *                       type: array
 *                     recentUploads:
 *                       type: array
 */
router.get('/stats', checkRole(['ADMIN', 'SUPER_ADMIN']), cloudStorageController.getStorageStats);

module.exports = router;