const MonitoringService = require('../services/monitoringService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class MonitoringController {
  constructor() {
    this.monitoringService = new MonitoringService();
  }

  // Get system health status
  async getHealth(req, res) {
    try {
      const healthStatus = await this.monitoringService.performHealthCheck();
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 
                        healthStatus.status === 'degraded' ? 206 : 503;

      res.status(statusCode).json({
        success: healthStatus.status !== 'unhealthy',
        data: healthStatus,
        message: `System is ${healthStatus.status}`
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        },
        error: {
          message: 'Health check failed',
          details: error.message
        }
      });
    }
  }

  // Get Prometheus metrics
  async getMetrics(req, res) {
    try {
      const metrics = await this.monitoringService.getMetrics();
      
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      console.error('Metrics retrieval error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve metrics',
          details: error.message
        }
      });
    }
  }

  // Get application performance statistics
  async getPerformanceStats(req, res) {
    try {
      const { timeRange = '24h' } = req.query;
      
      // Calculate time range
      const now = new Date();
      const timeRangeMs = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      
      const startTime = new Date(now.getTime() - (timeRangeMs[timeRange] || timeRangeMs['24h']));

      // Get performance data from database (you'd need to store this data)
      const performanceStats = {
        timeRange,
        period: {
          start: startTime.toISOString(),
          end: now.toISOString()
        },
        metrics: {
          // These would be calculated from stored metrics
          averageResponseTime: 150, // ms
          requestsPerMinute: 45,
          errorRate: 0.02, // 2%
          databaseQueryTime: 25, // ms
          queueProcessingTime: 300 // ms
        },
        trends: {
          responseTime: [120, 145, 160, 155, 150], // Last 5 data points
          requestVolume: [40, 42, 48, 46, 45],
          errorRate: [0.01, 0.015, 0.025, 0.02, 0.02]
        }
      };

      res.json({
        success: true,
        data: performanceStats,
        message: 'Performance statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Performance stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve performance statistics',
          details: error.message
        }
      });
    }
  }

  // Get system alerts
  async getSystemAlerts(req, res) {
    try {
      const { status = 'all', level, limit = 50, offset = 0 } = req.query;

      const whereClause = {};
      
      if (status === 'unacknowledged') {
        whereClause.acknowledged = false;
      } else if (status === 'acknowledged') {
        whereClause.acknowledged = true;
      }
      
      if (level) {
        whereClause.level = level.toUpperCase();
      }

      const [alerts, totalCount] = await Promise.all([
        prisma.systemAlert.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset)
        }),
        prisma.systemAlert.count({ where: whereClause })
      ]);

      res.json({
        success: true,
        data: {
          alerts,
          pagination: {
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: totalCount > parseInt(offset) + parseInt(limit)
          }
        },
        message: 'System alerts retrieved successfully'
      });
    } catch (error) {
      console.error('System alerts error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve system alerts',
          details: error.message
        }
      });
    }
  }

  // Acknowledge system alert
  async acknowledgeAlert(req, res) {
    try {
      const { alertId } = req.params;
      const { acknowledgedBy } = req.body;

      const alert = await prisma.systemAlert.update({
        where: { alertId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: acknowledgedBy || req.user.userId
        }
      });

      res.json({
        success: true,
        data: alert,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      console.error('Acknowledge alert error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to acknowledge alert',
          details: error.message
        }
      });
    }
  }

  // Create manual alert
  async createAlert(req, res) {
    try {
      const { level, message, details = {} } = req.body;

      if (!level || !message) {
        return res.status(400).json({
          success: false,
          error: { message: 'Level and message are required' }
        });
      }

      // Send alert through monitoring service
      await this.monitoringService.sendAlert(level, message, {
        ...details,
        createdBy: req.user.userId,
        manual: true
      });

      res.json({
        success: true,
        message: 'Alert created successfully'
      });
    } catch (error) {
      console.error('Create alert error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create alert',
          details: error.message
        }
      });
    }
  }

  // Get business metrics dashboard
  async getBusinessMetrics(req, res) {
    try {
      const { period = '24h' } = req.query;
      
      // Calculate time range
      const now = new Date();
      const periodMs = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      
      const startTime = new Date(now.getTime() - (periodMs[period] || periodMs['24h']));

      // Get business metrics
      const [
        activeLoansCount,
        totalOutstanding,
        paymentsToday,
        applicationsToday,
        riskLoansCount
      ] = await Promise.all([
        prisma.activeLoan.count({
          where: { loanStatus: 'ACTIVE' }
        }),
        prisma.activeLoan.aggregate({
          where: { loanStatus: 'ACTIVE' },
          _sum: { totalOutstanding: true }
        }),
        prisma.payment.aggregate({
          where: {
            paymentDate: { gte: startTime },
            paymentStatus: 'COMPLETED'
          },
          _count: true,
          _sum: { paymentAmount: true }
        }),
        prisma.loanApplication.count({
          where: { createdAt: { gte: startTime } }
        }),
        prisma.activeLoan.count({
          where: {
            loanStatus: 'ACTIVE',
            // This would require a risk_score field or calculation
            // For now, we'll use a placeholder
          }
        })
      ]);

      const businessMetrics = {
        period,
        timeRange: {
          start: startTime.toISOString(),
          end: now.toISOString()
        },
        metrics: {
          activeLoans: activeLoansCount,
          totalOutstanding: parseFloat(totalOutstanding._sum.totalOutstanding || 0),
          paymentsProcessed: paymentsToday._count || 0,
          paymentsAmount: parseFloat(paymentsToday._sum.paymentAmount || 0),
          newApplications: applicationsToday,
          systemHealth: 'healthy' // This would come from health check
        },
        kpis: {
          collectionEfficiency: paymentsToday._count > 0 ? 95.5 : 0, // Calculate based on due vs collected
          averageLoanAmount: activeLoansCount > 0 ? totalOutstanding._sum.totalOutstanding / activeLoansCount : 0,
          applicationApprovalRate: 87.5, // Calculate from applications
          customerSatisfactionScore: 4.2 // From surveys/feedback
        }
      };

      res.json({
        success: true,
        data: businessMetrics,
        message: 'Business metrics retrieved successfully'
      });
    } catch (error) {
      console.error('Business metrics error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve business metrics',
          details: error.message
        }
      });
    }
  }

  // Get API usage statistics
  async getApiUsageStats(req, res) {
    try {
      const { timeRange = '24h' } = req.query;
      
      // This would typically come from stored API usage data
      // For now, we'll return mock data that would be calculated from actual logs
      const apiStats = {
        timeRange,
        summary: {
          totalRequests: 12450,
          successfulRequests: 12180,
          failedRequests: 270,
          averageResponseTime: 145,
          p95ResponseTime: 520,
          p99ResponseTime: 1200
        },
        endpoints: [
          {
            endpoint: '/api/v1/loans/applications',
            method: 'POST',
            requestCount: 1250,
            averageResponseTime: 320,
            errorRate: 0.02
          },
          {
            endpoint: '/api/v1/payments/initiate',
            method: 'POST',
            requestCount: 890,
            averageResponseTime: 180,
            errorRate: 0.01
          },
          {
            endpoint: '/api/v1/auth/verify-otp',
            method: 'POST',
            requestCount: 2340,
            averageResponseTime: 95,
            errorRate: 0.05
          }
        ],
        statusCodeDistribution: {
          '200': 10890,
          '201': 1290,
          '400': 180,
          '401': 45,
          '403': 25,
          '404': 15,
          '500': 5
        },
        trends: {
          hourly: [
            { hour: '00:00', requests: 145 },
            { hour: '01:00', requests: 89 },
            { hour: '02:00', requests: 67 },
            // ... more hourly data
          ]
        }
      };

      res.json({
        success: true,
        data: apiStats,
        message: 'API usage statistics retrieved successfully'
      });
    } catch (error) {
      console.error('API stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve API usage statistics',
          details: error.message
        }
      });
    }
  }

  // Get error tracking summary
  async getErrorTracking(req, res) {
    try {
      const { timeRange = '24h', groupBy = 'error_type' } = req.query;
      
      // This would integrate with your error tracking system (Sentry, etc.)
      const errorSummary = {
        timeRange,
        summary: {
          totalErrors: 45,
          uniqueErrors: 12,
          errorRate: 0.36, // Percentage of requests with errors
          topErrors: [
            {
              type: 'ValidationError',
              count: 18,
              percentage: 40,
              lastOccurrence: new Date().toISOString()
            },
            {
              type: 'DatabaseConnectionError',
              count: 12,
              percentage: 26.7,
              lastOccurrence: new Date().toISOString()
            },
            {
              type: 'PaymentGatewayError',
              count: 8,
              percentage: 17.8,
              lastOccurrence: new Date().toISOString()
            }
          ]
        },
        trends: {
          daily: [
            { date: '2024-06-16', errors: 52 },
            { date: '2024-06-17', errors: 45 },
            // ... more daily data
          ]
        },
        affectedUsers: 23,
        resolvedErrors: 38,
        pendingErrors: 7
      };

      res.json({
        success: true,
        data: errorSummary,
        message: 'Error tracking summary retrieved successfully'
      });
    } catch (error) {
      console.error('Error tracking error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve error tracking data',
          details: error.message
        }
      });
    }
  }

  // Test monitoring endpoints
  async testAlert(req, res) {
    try {
      const { level = 'info', message = 'Test alert from monitoring system' } = req.body;
      
      await this.monitoringService.sendAlert(level, message, {
        test: true,
        triggeredBy: req.user.userId,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        message: 'Test alert sent successfully'
      });
    } catch (error) {
      console.error('Test alert error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send test alert',
          details: error.message
        }
      });
    }
  }

  // Test error tracking
  async testError(req, res) {
    try {
      const { errorType = 'TestError', message = 'This is a test error' } = req.body;
      
      const testError = new Error(message);
      testError.name = errorType;
      
      this.monitoringService.logError(testError, {
        test: true,
        triggeredBy: req.user.userId,
        endpoint: '/api/v1/monitoring/test-error'
      });

      res.json({
        success: true,
        message: 'Test error logged successfully'
      });
    } catch (error) {
      console.error('Test error logging failed:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to log test error',
          details: error.message
        }
      });
    }
  }
}

module.exports = new MonitoringController();