const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');
const { checkRole } = require('../middleware/roleMiddleware');

// Apply authentication to all analytics routes
router.use(authMiddleware);

// Admin and Super Admin only routes
router.use(checkRole(['ADMIN', 'SUPER_ADMIN']));

/**
 * @swagger
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get comprehensive analytics dashboard data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics dashboard data
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
 *                     riskAnalysis:
 *                       type: object
 *                     customerInsights:
 *                       type: object
 *                     marketTrends:
 *                       type: object
 *                     teamPerformance:
 *                       type: object
 *                     businessForecasts:
 *                       type: object
 */
router.get('/dashboard', analyticsController.getDashboardAnalytics);

/**
 * @swagger
 * /api/v1/analytics/risk/predictions:
 *   get:
 *     summary: Get loan default risk predictions
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [30d, 60d, 90d]
 *         description: Analysis timeframe
 *     responses:
 *       200:
 *         description: Default risk predictions
 */
router.get('/risk/predictions', analyticsController.getLoanDefaultPrediction);

/**
 * @swagger
 * /api/v1/analytics/risk/loan/{loanId}:
 *   get:
 *     summary: Get risk analysis for specific loan
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loanId
 *         required: true
 *         schema:
 *           type: string
 *         description: Loan ID
 *     responses:
 *       200:
 *         description: Loan risk analysis
 */
router.get('/risk/loan/:loanId', analyticsController.getLoanRiskAnalysis);

/**
 * @swagger
 * /api/v1/analytics/customers/behavior:
 *   get:
 *     summary: Get customer behavior patterns analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer behavior patterns
 */
router.get('/customers/behavior', analyticsController.getCustomerBehaviorPatterns);

/**
 * @swagger
 * /api/v1/analytics/customers/segments:
 *   get:
 *     summary: Get customer segment analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: segment
 *         schema:
 *           type: string
 *           enum: [PREMIUM, REGULAR, BASIC, RISK, ALL]
 *         description: Customer segment filter
 *     responses:
 *       200:
 *         description: Customer segment analysis
 */
router.get('/customers/segments', analyticsController.getCustomerSegmentAnalysis);

/**
 * @swagger
 * /api/v1/analytics/market/gold-correlation:
 *   get:
 *     summary: Get gold price correlation analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gold price correlation analysis
 */
router.get('/market/gold-correlation', analyticsController.getGoldPriceCorrelation);

/**
 * @swagger
 * /api/v1/analytics/team/performance:
 *   get:
 *     summary: Get field agent performance analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent performance analytics
 */
router.get('/team/performance', analyticsController.getFieldAgentPerformance);

/**
 * @swagger
 * /api/v1/analytics/business/revenue-forecast:
 *   get:
 *     summary: Get revenue forecasts
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *         description: Number of months to forecast
 *     responses:
 *       200:
 *         description: Revenue forecast data
 */
router.get('/business/revenue-forecast', analyticsController.getRevenueForecast);

/**
 * @swagger
 * /api/v1/analytics/trends:
 *   get:
 *     summary: Get performance trends analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [3m, 6m, 12m]
 *         description: Analysis period
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           enum: [revenue, risk, customer, agent]
 *         description: Metric to analyze
 *     responses:
 *       200:
 *         description: Performance trends analysis
 */
router.get('/trends', analyticsController.getPerformanceTrends);

module.exports = router;