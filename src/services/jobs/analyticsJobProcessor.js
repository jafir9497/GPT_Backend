const AdvancedAnalyticsService = require('../analyticsService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AnalyticsJobProcessor {
  static async generateAnalyticsReport(job) {
    const { type, date, parameters } = job.data;
    
    try {
      console.log(`Processing analytics report job: ${job.id} - Type: ${type}, Date: ${date}`);
      
      const analyticsService = new AdvancedAnalyticsService();
      let reportData;
      let reportTitle;

      switch (type) {
        case 'daily':
          reportData = await AnalyticsJobProcessor.generateDailyReport(analyticsService, date);
          reportTitle = `Daily Analytics Report - ${date}`;
          break;
          
        case 'weekly':
          reportData = await AnalyticsJobProcessor.generateWeeklyReport(analyticsService, date);
          reportTitle = `Weekly Analytics Report - Week of ${date}`;
          break;
          
        case 'monthly':
          reportData = await AnalyticsJobProcessor.generateMonthlyReport(analyticsService, date);
          reportTitle = `Monthly Analytics Report - ${date}`;
          break;
          
        case 'custom':
          reportData = await AnalyticsJobProcessor.generateCustomReport(analyticsService, parameters);
          reportTitle = `Custom Analytics Report - ${date}`;
          break;
          
        default:
          reportData = await analyticsService.getDashboardAnalytics();
          reportTitle = `Analytics Report - ${date}`;
      }

      // Save report to database
      const reportRecord = await prisma.analyticsReport.create({
        data: {
          reportType: type.toUpperCase(),
          title: reportTitle,
          reportDate: new Date(date),
          reportData: reportData,
          status: 'COMPLETED',
          generatedAt: new Date(),
          parameters: parameters || {}
        }
      });

      console.log(`Analytics report generated successfully: ${reportTitle}`);
      
      return {
        success: true,
        reportId: reportRecord.reportId,
        reportType: type,
        title: reportTitle,
        dataSize: JSON.stringify(reportData).length,
        generatedAt: reportRecord.generatedAt
      };
    } catch (error) {
      console.error(`Analytics report job failed for type ${type}:`, error);
      
      // Save failed report record
      await prisma.analyticsReport.create({
        data: {
          reportType: type.toUpperCase(),
          title: `Failed ${type} Report - ${date}`,
          reportDate: new Date(date),
          status: 'FAILED',
          error: error.message,
          parameters: parameters || {}
        }
      });
      
      throw new Error(`Analytics report generation failed: ${error.message}`);
    }
  }

  static async generateDailyReport(analyticsService, date) {
    const reportDate = new Date(date);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get daily statistics
    const [dailyLoans, dailyPayments, dailyApplications] = await Promise.all([
      prisma.activeLoan.count({
        where: {
          createdAt: {
            gte: reportDate,
            lt: nextDay
          }
        }
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: {
            gte: reportDate,
            lt: nextDay
          }
        },
        _sum: { paymentAmount: true },
        _count: true
      }),
      prisma.loanApplication.count({
        where: {
          createdAt: {
            gte: reportDate,
            lt: nextDay
          }
        }
      })
    ]);

    // Get risk analysis
    const riskAnalysis = await analyticsService.getLoanDefaultPrediction('1d');
    
    // Get customer insights
    const customerBehavior = await analyticsService.getCustomerBehaviorPatterns();

    return {
      date: date,
      summary: {
        newLoans: dailyLoans,
        totalPayments: dailyPayments._count || 0,
        paymentAmount: parseFloat(dailyPayments._sum.paymentAmount || 0),
        newApplications: dailyApplications
      },
      riskMetrics: {
        highRiskLoans: riskAnalysis.highRiskLoans,
        averageRiskScore: riskAnalysis.averageRiskScore
      },
      customerMetrics: {
        totalCustomers: customerBehavior.totalCustomers,
        averagePunctuality: customerBehavior.averageMetrics.paymentPunctuality
      }
    };
  }

  static async generateWeeklyReport(analyticsService, date) {
    const reportDate = new Date(date);
    const weekStart = new Date(reportDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get comprehensive analytics
    const [
      defaultPrediction,
      customerBehavior,
      agentPerformance,
      goldCorrelation
    ] = await Promise.all([
      analyticsService.getLoanDefaultPrediction('7d'),
      analyticsService.getCustomerBehaviorPatterns(),
      analyticsService.getFieldAgentPerformance(),
      analyticsService.getGoldPriceCorrelation()
    ]);

    // Get weekly statistics
    const weeklyStats = await Promise.all([
      prisma.activeLoan.count({
        where: {
          createdAt: { gte: weekStart, lt: weekEnd }
        }
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: weekStart, lt: weekEnd }
        },
        _sum: { paymentAmount: true },
        _count: true
      }),
      prisma.loanApplication.groupBy({
        by: ['applicationStatus'],
        where: {
          createdAt: { gte: weekStart, lt: weekEnd }
        },
        _count: true
      })
    ]);

    return {
      weekOf: date,
      period: {
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0]
      },
      summary: {
        newLoans: weeklyStats[0],
        totalPayments: weeklyStats[1]._count || 0,
        paymentAmount: parseFloat(weeklyStats[1]._sum.paymentAmount || 0),
        applicationBreakdown: weeklyStats[2]
      },
      riskAnalysis: defaultPrediction,
      customerInsights: customerBehavior,
      teamPerformance: agentPerformance,
      marketTrends: goldCorrelation,
      insights: [
        ...defaultPrediction.loans.slice(0, 5).map(loan => 
          `High risk loan: ${loan.loanNumber} (Score: ${loan.riskScore})`),
        ...goldCorrelation.correlationInsights.slice(0, 3)
      ]
    };
  }

  static async generateMonthlyReport(analyticsService, date) {
    const reportDate = new Date(date);
    const monthStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
    const monthEnd = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 1);

    // Get comprehensive analytics for the month
    const [
      dashboardAnalytics,
      revenueForecast,
      monthlyStats
    ] = await Promise.all([
      analyticsService.getDashboardAnalytics(),
      analyticsService.getRevenueForecast(12),
      AnalyticsJobProcessor.getMonthlyStatistics(monthStart, monthEnd)
    ]);

    return {
      month: `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`,
      period: {
        startDate: monthStart.toISOString().split('T')[0],
        endDate: monthEnd.toISOString().split('T')[0]
      },
      comprehensiveAnalytics: dashboardAnalytics,
      monthlyStatistics: monthlyStats,
      businessForecasts: revenueForecast,
      keyMetrics: {
        totalLoans: monthlyStats.loans.total,
        totalRevenue: monthlyStats.revenue.total,
        customerGrowth: monthlyStats.customers.newCustomers,
        collectionEfficiency: monthlyStats.payments.collectionRate
      },
      recommendations: AnalyticsJobProcessor.generateMonthlyRecommendations(
        dashboardAnalytics, 
        monthlyStats
      )
    };
  }

  static async generateCustomReport(analyticsService, parameters) {
    const reportData = {};

    // Include requested analytics modules
    if (parameters.includeRiskAnalysis) {
      reportData.riskAnalysis = await analyticsService.getLoanDefaultPrediction(
        parameters.riskTimeframe || '30d'
      );
    }

    if (parameters.includeCustomerBehavior) {
      reportData.customerBehavior = await analyticsService.getCustomerBehaviorPatterns();
    }

    if (parameters.includeAgentPerformance) {
      reportData.agentPerformance = await analyticsService.getFieldAgentPerformance();
    }

    if (parameters.includeGoldCorrelation) {
      reportData.goldCorrelation = await analyticsService.getGoldPriceCorrelation();
    }

    if (parameters.includeRevenueForecast) {
      reportData.revenueForecast = await analyticsService.getRevenueForecast(
        parameters.forecastMonths || 6
      );
    }

    // Custom date range statistics
    if (parameters.dateRange) {
      reportData.customStatistics = await AnalyticsJobProcessor.getCustomRangeStatistics(
        new Date(parameters.dateRange.startDate),
        new Date(parameters.dateRange.endDate)
      );
    }

    return {
      parameters: parameters,
      generatedAt: new Date().toISOString(),
      reportData: reportData
    };
  }

  static async getMonthlyStatistics(monthStart, monthEnd) {
    const [
      loanStats,
      paymentStats,
      customerStats,
      applicationStats
    ] = await Promise.all([
      // Loan statistics
      prisma.activeLoan.aggregate({
        where: {
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        _count: true,
        _sum: { principalAmount: true, totalOutstanding: true }
      }),
      
      // Payment statistics
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: monthStart, lt: monthEnd }
        },
        _count: true,
        _sum: { paymentAmount: true, interestPayment: true }
      }),
      
      // Customer statistics
      prisma.user.count({
        where: {
          userType: 'CUSTOMER',
          createdAt: { gte: monthStart, lt: monthEnd }
        }
      }),
      
      // Application statistics
      prisma.loanApplication.groupBy({
        by: ['applicationStatus'],
        where: {
          createdAt: { gte: monthStart, lt: monthEnd }
        },
        _count: true
      })
    ]);

    return {
      loans: {
        total: loanStats._count || 0,
        totalPrincipal: parseFloat(loanStats._sum.principalAmount || 0),
        totalOutstanding: parseFloat(loanStats._sum.totalOutstanding || 0)
      },
      payments: {
        total: paymentStats._count || 0,
        totalAmount: parseFloat(paymentStats._sum.paymentAmount || 0),
        totalInterest: parseFloat(paymentStats._sum.interestPayment || 0),
        collectionRate: loanStats._sum.totalOutstanding > 0 ? 
          (paymentStats._sum.paymentAmount / loanStats._sum.totalOutstanding) * 100 : 0
      },
      revenue: {
        total: parseFloat(paymentStats._sum.interestPayment || 0)
      },
      customers: {
        newCustomers: customerStats
      },
      applications: applicationStats
    };
  }

  static async getCustomRangeStatistics(startDate, endDate) {
    return await AnalyticsJobProcessor.getMonthlyStatistics(startDate, endDate);
  }

  static generateMonthlyRecommendations(dashboardAnalytics, monthlyStats) {
    const recommendations = [];

    // Risk-based recommendations
    if (dashboardAnalytics.riskAnalysis.highRiskLoans > 10) {
      recommendations.push({
        category: 'Risk Management',
        priority: 'HIGH',
        recommendation: 'Implement enhanced monitoring for high-risk loans',
        impact: 'Reduce potential defaults by 15-20%'
      });
    }

    // Revenue recommendations
    if (monthlyStats.revenue.total < 500000) {
      recommendations.push({
        category: 'Revenue Growth',
        priority: 'MEDIUM',
        recommendation: 'Focus on customer acquisition and larger loan amounts',
        impact: 'Potential 25% revenue increase'
      });
    }

    // Collection efficiency recommendations
    if (monthlyStats.payments.collectionRate < 80) {
      recommendations.push({
        category: 'Collections',
        priority: 'HIGH',
        recommendation: 'Improve collection processes and customer communication',
        impact: 'Increase collection rate to 90%+'
      });
    }

    // Customer growth recommendations
    if (monthlyStats.customers.newCustomers < 100) {
      recommendations.push({
        category: 'Growth',
        priority: 'MEDIUM',
        recommendation: 'Enhance marketing efforts and referral programs',
        impact: 'Double monthly customer acquisition'
      });
    }

    return recommendations;
  }

  static async updateCustomerScores(job) {
    const { type, date } = job.data;
    
    try {
      console.log(`Processing customer score update job: ${job.id} - Type: ${type}`);
      
      const analyticsService = new AdvancedAnalyticsService();
      const customerBehavior = await analyticsService.getCustomerBehaviorPatterns();
      
      let updatedCount = 0;
      
      for (const customer of customerBehavior.customers) {
        try {
          await prisma.user.update({
            where: { userId: customer.customerId },
            data: {
              metadata: {
                customerScore: customer.customerScore,
                segment: customer.segment,
                paymentPunctuality: customer.paymentPunctuality,
                lastScoreUpdate: new Date().toISOString()
              }
            }
          });
          updatedCount++;
        } catch (error) {
          console.warn(`Failed to update score for customer ${customer.customerId}:`, error);
        }
      }

      console.log(`Customer scores updated: ${updatedCount} customers`);
      
      return {
        success: true,
        updatedCustomers: updatedCount,
        totalCustomers: customerBehavior.customers.length,
        updateType: type
      };
    } catch (error) {
      console.error(`Customer score update job failed:`, error);
      throw new Error(`Customer score update failed: ${error.message}`);
    }
  }

  static async calculateRiskMetrics(job) {
    const { type, date } = job.data;
    
    try {
      console.log(`Processing risk metrics calculation job: ${job.id} - Type: ${type}`);
      
      const analyticsService = new AdvancedAnalyticsService();
      const riskAnalysis = await analyticsService.getLoanDefaultPrediction();
      
      // Create risk metrics summary
      const riskMetrics = {
        calculationDate: new Date(date),
        calculationType: type,
        totalLoans: riskAnalysis.totalLoans,
        riskDistribution: {
          high: riskAnalysis.highRiskLoans,
          medium: riskAnalysis.mediumRiskLoans,
          low: riskAnalysis.lowRiskLoans
        },
        averageRiskScore: riskAnalysis.averageRiskScore,
        topRiskyLoans: riskAnalysis.loans.slice(0, 10).map(loan => ({
          loanId: loan.loanId,
          riskScore: loan.riskScore,
          riskCategory: loan.riskCategory
        }))
      };

      // Save risk metrics to database
      const metricsRecord = await prisma.riskMetrics.create({
        data: {
          calculationType: type.toUpperCase(),
          calculationDate: new Date(date),
          metricsData: riskMetrics,
          totalLoansAnalyzed: riskAnalysis.totalLoans,
          highRiskCount: riskAnalysis.highRiskLoans,
          averageRiskScore: riskAnalysis.averageRiskScore,
          status: 'COMPLETED',
          calculatedAt: new Date()
        }
      });

      console.log(`Risk metrics calculated successfully for ${riskAnalysis.totalLoans} loans`);
      
      return {
        success: true,
        metricsId: metricsRecord.metricsId,
        calculationType: type,
        totalLoansAnalyzed: riskAnalysis.totalLoans,
        highRiskLoans: riskAnalysis.highRiskLoans,
        averageRiskScore: riskAnalysis.averageRiskScore
      };
    } catch (error) {
      console.error(`Risk metrics calculation job failed:`, error);
      
      // Save failed metrics record
      await prisma.riskMetrics.create({
        data: {
          calculationType: type.toUpperCase(),
          calculationDate: new Date(date),
          status: 'FAILED',
          error: error.message
        }
      });
      
      throw new Error(`Risk metrics calculation failed: ${error.message}`);
    }
  }
}

module.exports = AnalyticsJobProcessor;