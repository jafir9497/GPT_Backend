const AdvancedAnalyticsService = require('../services/analyticsService');
const analyticsService = new AdvancedAnalyticsService();

class AnalyticsController {
  // Get comprehensive dashboard analytics
  async getDashboardAnalytics(req, res) {
    try {
      const analytics = await analyticsService.getDashboardAnalytics();
      
      res.json({
        success: true,
        data: analytics,
        message: 'Analytics data retrieved successfully'
      });
    } catch (error) {
      console.error('Dashboard analytics error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve analytics data',
          details: error.message
        }
      });
    }
  }

  // Get loan default risk predictions
  async getLoanDefaultPrediction(req, res) {
    try {
      const { timeframe = '30d' } = req.query;
      
      const prediction = await analyticsService.getLoanDefaultPrediction(timeframe);
      
      res.json({
        success: true,
        data: prediction,
        message: 'Default prediction analysis completed'
      });
    } catch (error) {
      console.error('Default prediction error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze default predictions',
          details: error.message
        }
      });
    }
  }

  // Get customer behavior patterns
  async getCustomerBehaviorPatterns(req, res) {
    try {
      const patterns = await analyticsService.getCustomerBehaviorPatterns();
      
      res.json({
        success: true,
        data: patterns,
        message: 'Customer behavior analysis completed'
      });
    } catch (error) {
      console.error('Customer behavior analysis error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze customer behavior',
          details: error.message
        }
      });
    }
  }

  // Get gold price correlation analysis
  async getGoldPriceCorrelation(req, res) {
    try {
      const correlation = await analyticsService.getGoldPriceCorrelation();
      
      res.json({
        success: true,
        data: correlation,
        message: 'Gold price correlation analysis completed'
      });
    } catch (error) {
      console.error('Gold price correlation error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze gold price correlation',
          details: error.message
        }
      });
    }
  }

  // Get field agent performance analytics
  async getFieldAgentPerformance(req, res) {
    try {
      const performance = await analyticsService.getFieldAgentPerformance();
      
      res.json({
        success: true,
        data: performance,
        message: 'Agent performance analysis completed'
      });
    } catch (error) {
      console.error('Agent performance analysis error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze agent performance',
          details: error.message
        }
      });
    }
  }

  // Get revenue forecasts
  async getRevenueForecast(req, res) {
    try {
      const { months = 6 } = req.query;
      const forecast = await analyticsService.getRevenueForecast(parseInt(months));
      
      res.json({
        success: true,
        data: forecast,
        message: 'Revenue forecast completed'
      });
    } catch (error) {
      console.error('Revenue forecast error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate revenue forecast',
          details: error.message
        }
      });
    }
  }

  // Get risk analysis for specific loan
  async getLoanRiskAnalysis(req, res) {
    try {
      const { loanId } = req.params;
      
      if (!loanId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Loan ID is required' }
        });
      }

      // Get specific loan risk analysis
      const defaultPrediction = await analyticsService.getLoanDefaultPrediction();
      const loanRisk = defaultPrediction.loans.find(loan => loan.loanId === loanId);
      
      if (!loanRisk) {
        return res.status(404).json({
          success: false,
          error: { message: 'Loan not found in risk analysis' }
        });
      }

      res.json({
        success: true,
        data: loanRisk,
        message: 'Loan risk analysis completed'
      });
    } catch (error) {
      console.error('Loan risk analysis error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze loan risk',
          details: error.message
        }
      });
    }
  }

  // Get customer segment analysis
  async getCustomerSegmentAnalysis(req, res) {
    try {
      const { segment } = req.query;
      
      const patterns = await analyticsService.getCustomerBehaviorPatterns();
      
      let filteredCustomers = patterns.customers;
      if (segment && segment !== 'ALL') {
        filteredCustomers = patterns.customers.filter(c => c.segment === segment);
      }

      res.json({
        success: true,
        data: {
          segment: segment || 'ALL',
          totalCustomers: filteredCustomers.length,
          customers: filteredCustomers,
          segmentDistribution: patterns.segments,
          averageMetrics: patterns.averageMetrics
        },
        message: 'Customer segment analysis completed'
      });
    } catch (error) {
      console.error('Customer segment analysis error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze customer segments',
          details: error.message
        }
      });
    }
  }

  // Get performance trends
  async getPerformanceTrends(req, res) {
    try {
      const { period = '6m', metric = 'revenue' } = req.query;
      
      let analyticsData;
      
      switch (metric) {
        case 'revenue':
          analyticsData = await analyticsService.getRevenueForecast();
          break;
        case 'risk':
          analyticsData = await analyticsService.getLoanDefaultPrediction();
          break;
        case 'customer':
          analyticsData = await analyticsService.getCustomerBehaviorPatterns();
          break;
        case 'agent':
          analyticsData = await analyticsService.getFieldAgentPerformance();
          break;
        default:
          analyticsData = await analyticsService.getDashboardAnalytics();
      }

      res.json({
        success: true,
        data: {
          metric,
          period,
          trends: analyticsData,
          insights: analyticsData.insights || []
        },
        message: 'Performance trends analysis completed'
      });
    } catch (error) {
      console.error('Performance trends error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to analyze performance trends',
          details: error.message
        }
      });
    }
  }
}

module.exports = new AnalyticsController();