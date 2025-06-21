const express = require('express');
const router = express.Router();
const jobQueueController = require('../controllers/jobQueueController');
const authMiddleware = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

// Apply authentication to all job routes
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/jobs/stats:
 *   get:
 *     summary: Get queue statistics
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue statistics
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
 *                     email:
 *                       type: object
 *                     notification:
 *                       type: object
 *                     document:
 *                       type: object
 *                     data:
 *                       type: object
 *                     analytics:
 *                       type: object
 */
router.get('/stats', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.getQueueStats);

/**
 * @swagger
 * /api/v1/jobs/queue/{queueName}/pause:
 *   post:
 *     summary: Pause a queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [email, notification, document, data, analytics]
 *         description: Queue name to pause
 *     responses:
 *       200:
 *         description: Queue paused successfully
 */
router.post('/queue/:queueName/pause', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.pauseQueue);

/**
 * @swagger
 * /api/v1/jobs/queue/{queueName}/resume:
 *   post:
 *     summary: Resume a queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [email, notification, document, data, analytics]
 *         description: Queue name to resume
 *     responses:
 *       200:
 *         description: Queue resumed successfully
 */
router.post('/queue/:queueName/resume', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.resumeQueue);

/**
 * @swagger
 * /api/v1/jobs/queue/{queueName}/clean:
 *   post:
 *     summary: Clean a queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [email, notification, document, data, analytics]
 *         description: Queue name to clean
 *       - in: query
 *         name: grace
 *         schema:
 *           type: integer
 *         description: Grace period in milliseconds
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [completed, failed, active, waiting]
 *         description: Job status to clean
 *     responses:
 *       200:
 *         description: Queue cleaned successfully
 */
router.post('/queue/:queueName/clean', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.cleanQueue);

/**
 * @swagger
 * /api/v1/jobs/email:
 *   post:
 *     summary: Add email job to queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [send-email, send-receipt-email, send-statement-email]
 *               to:
 *                 type: string
 *               subject:
 *                 type: string
 *               content:
 *                 type: string
 *               template:
 *                 type: string
 *               priority:
 *                 type: integer
 *               delay:
 *                 type: integer
 *             required: [type, to]
 *     responses:
 *       200:
 *         description: Email job queued successfully
 */
router.post('/email', checkRole(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), jobQueueController.addEmailJob);

/**
 * @swagger
 * /api/v1/jobs/notification:
 *   post:
 *     summary: Add notification job to queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [send-sms, send-push-notification, send-whatsapp]
 *               phoneNumber:
 *                 type: string
 *               userId:
 *                 type: string
 *               message:
 *                 type: string
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               data:
 *                 type: object
 *               priority:
 *                 type: integer
 *             required: [type]
 *     responses:
 *       200:
 *         description: Notification job queued successfully
 */
router.post('/notification', checkRole(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), jobQueueController.addNotificationJob);

/**
 * @swagger
 * /api/v1/jobs/document:
 *   post:
 *     summary: Add document generation job to queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [generate-pdf, generate-receipt, generate-statement]
 *               documentType:
 *                 type: string
 *               data:
 *                 type: object
 *               template:
 *                 type: string
 *               priority:
 *                 type: integer
 *             required: [type, data]
 *     responses:
 *       200:
 *         description: Document job queued successfully
 */
router.post('/document', checkRole(['ADMIN', 'SUPER_ADMIN', 'EMPLOYEE']), jobQueueController.addDocumentJob);

/**
 * @swagger
 * /api/v1/jobs/data:
 *   post:
 *     summary: Add data processing job to queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [export-data, import-data]
 *               userId:
 *                 type: string
 *               exportType:
 *                 type: string
 *               dataType:
 *                 type: string
 *               filters:
 *                 type: object
 *               fileUrl:
 *                 type: string
 *               mappings:
 *                 type: object
 *             required: [type]
 *     responses:
 *       200:
 *         description: Data job queued successfully
 */
router.post('/data', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.addDataJob);

/**
 * @swagger
 * /api/v1/jobs/analytics:
 *   post:
 *     summary: Add analytics job to queue
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [generate-analytics-report]
 *               reportType:
 *                 type: string
 *               parameters:
 *                 type: object
 *             required: [type]
 *     responses:
 *       200:
 *         description: Analytics job queued successfully
 */
router.post('/analytics', checkRole(['ADMIN', 'SUPER_ADMIN']), jobQueueController.addAnalyticsJob);

module.exports = router;