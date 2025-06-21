const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const authMiddleware = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

/**
 * @swagger
 * /api/v1/monitoring/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: System is healthy
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
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *                     timestamp:
 *                       type: string
 *                     checks:
 *                       type: object
 *       206:
 *         description: System is degraded
 *       503:
 *         description: System is unhealthy
 */
router.get('/health', monitoringController.getHealth);

/**
 * @swagger
 * /api/v1/monitoring/metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/metrics', monitoringController.getMetrics);

// Protected routes - require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/monitoring/performance:
 *   get:
 *     summary: Get application performance statistics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Time range for statistics
 *     responses:
 *       200:
 *         description: Performance statistics
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
 *                     timeRange:
 *                       type: string
 *                     metrics:
 *                       type: object
 *                     trends:
 *                       type: object
 */
router.get('/performance', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.getPerformanceStats);

/**
 * @swagger
 * /api/v1/monitoring/business-metrics:
 *   get:
 *     summary: Get business metrics dashboard
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Time period for metrics
 *     responses:
 *       200:
 *         description: Business metrics
 */
router.get('/business-metrics', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.getBusinessMetrics);

/**
 * @swagger
 * /api/v1/monitoring/api-usage:
 *   get:
 *     summary: Get API usage statistics
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Time range for API usage stats
 *     responses:
 *       200:
 *         description: API usage statistics
 */
router.get('/api-usage', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.getApiUsageStats);

/**
 * @swagger
 * /api/v1/monitoring/errors:
 *   get:
 *     summary: Get error tracking summary
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Time range for error tracking
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [error_type, endpoint, user]
 *         description: Group errors by
 *     responses:
 *       200:
 *         description: Error tracking summary
 */
router.get('/errors', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.getErrorTracking);

/**
 * @swagger
 * /api/v1/monitoring/alerts:
 *   get:
 *     summary: Get system alerts
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, acknowledged, unacknowledged]
 *         description: Filter alerts by status
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [critical, warning, info]
 *         description: Filter alerts by level
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of alerts to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of alerts to skip
 *     responses:
 *       200:
 *         description: System alerts
 */
router.get('/alerts', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.getSystemAlerts);

/**
 * @swagger
 * /api/v1/monitoring/alerts:
 *   post:
 *     summary: Create manual alert
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               level:
 *                 type: string
 *                 enum: [critical, warning, info]
 *               message:
 *                 type: string
 *               details:
 *                 type: object
 *             required: [level, message]
 *     responses:
 *       200:
 *         description: Alert created successfully
 */
router.post('/alerts', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.createAlert);

/**
 * @swagger
 * /api/v1/monitoring/alerts/{alertId}/acknowledge:
 *   post:
 *     summary: Acknowledge system alert
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               acknowledgedBy:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged successfully
 */
router.post('/alerts/:alertId/acknowledge', checkRole(['ADMIN', 'SUPER_ADMIN']), monitoringController.acknowledgeAlert);

/**
 * @swagger
 * /api/v1/monitoring/test/alert:
 *   post:
 *     summary: Send test alert
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               level:
 *                 type: string
 *                 enum: [critical, warning, info]
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test alert sent successfully
 */
router.post('/test/alert', checkRole(['SUPER_ADMIN']), monitoringController.testAlert);

/**
 * @swagger
 * /api/v1/monitoring/test/error:
 *   post:
 *     summary: Test error tracking
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               errorType:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test error logged successfully
 */
router.post('/test/error', checkRole(['SUPER_ADMIN']), monitoringController.testError);

module.exports = router;