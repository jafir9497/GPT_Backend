const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AdvancedAnalyticsService {
  // Predictive loan default analytics
  async getLoanDefaultPrediction(timeframe = '30d') {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get loans with payment history
      const loansWithPayments = await prisma.activeLoan.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo }
        },
        include: {
          payments: {
            orderBy: { paymentDate: 'desc' },
            take: 6 // Last 6 payments for pattern analysis
          },
          customer: {
            select: { 
              userId: true, 
              createdAt: true,
              activeLoans: { select: { loanId: true } }
            }
          }
        }
      });

      const defaultRiskAnalysis = loansWithPayments.map(loan => {
        let riskScore = 0;
        const factors = {};

        // Payment delay pattern analysis
        const delayedPayments = loan.payments.filter(payment => {
          const dueDate = new Date(payment.dueDate || payment.paymentDate);
          const paymentDate = new Date(payment.paymentDate);
          return paymentDate > dueDate;
        });

        factors.paymentDelayRate = delayedPayments.length / Math.max(loan.payments.length, 1);
        riskScore += factors.paymentDelayRate * 30;

        // Outstanding amount vs original amount
        factors.outstandingRatio = loan.totalOutstanding / loan.principalAmount;
        if (factors.outstandingRatio > 0.8) riskScore += 25;

        // Customer age and loan count
        const customerAge = (Date.now() - new Date(loan.customer.createdAt)) / (1000 * 60 * 60 * 24);
        factors.customerAgeDays = customerAge;
        if (customerAge < 90) riskScore += 15; // New customers are higher risk

        factors.activeLoanCount = loan.customer.activeLoans.length;
        if (factors.activeLoanCount > 2) riskScore += 10;

        // Days since last payment
        const lastPayment = loan.payments[0];
        if (lastPayment) {
          const daysSinceLastPayment = (Date.now() - new Date(lastPayment.paymentDate)) / (1000 * 60 * 60 * 24);
          factors.daysSinceLastPayment = daysSinceLastPayment;
          if (daysSinceLastPayment > 30) riskScore += 20;
          if (daysSinceLastPayment > 60) riskScore += 30;
        } else {
          riskScore += 40; // No payments yet
        }

        // Risk categories
        let riskCategory;
        if (riskScore >= 70) riskCategory = 'HIGH';
        else if (riskScore >= 40) riskCategory = 'MEDIUM';
        else riskCategory = 'LOW';

        return {
          loanId: loan.loanId,
          loanNumber: loan.loanNumber,
          customerId: loan.customerId,
          riskScore: Math.min(riskScore, 100),
          riskCategory,
          factors,
          recommendations: this.generateRiskRecommendations(riskCategory, factors)
        };
      });

      return {
        totalLoans: loansWithPayments.length,
        highRiskLoans: defaultRiskAnalysis.filter(l => l.riskCategory === 'HIGH').length,
        mediumRiskLoans: defaultRiskAnalysis.filter(l => l.riskCategory === 'MEDIUM').length,
        lowRiskLoans: defaultRiskAnalysis.filter(l => l.riskCategory === 'LOW').length,
        averageRiskScore: defaultRiskAnalysis.reduce((sum, l) => sum + l.riskScore, 0) / defaultRiskAnalysis.length,
        loans: defaultRiskAnalysis.sort((a, b) => b.riskScore - a.riskScore)
      };
    } catch (error) {
      throw new Error(`Default prediction analysis failed: ${error.message}`);
    }
  }

  generateRiskRecommendations(riskCategory, factors) {
    const recommendations = [];

    if (riskCategory === 'HIGH') {
      recommendations.push('Immediate contact with customer required');
      recommendations.push('Consider restructuring payment terms');
      if (factors.daysSinceLastPayment > 60) {
        recommendations.push('Escalate to collections team');
      }
    } else if (riskCategory === 'MEDIUM') {
      recommendations.push('Schedule follow-up call within 7 days');
      recommendations.push('Send payment reminder notifications');
      if (factors.paymentDelayRate > 0.3) {
        recommendations.push('Offer payment assistance options');
      }
    } else {
      recommendations.push('Continue regular monitoring');
      if (factors.customerAgeDays < 90) {
        recommendations.push('Provide onboarding support');
      }
    }

    return recommendations;
  }

  // Customer behavior patterns analysis
  async getCustomerBehaviorPatterns() {
    try {
      const behaviorData = await prisma.user.findMany({
        where: { userType: 'CUSTOMER' },
        include: {
          activeLoans: {
            include: {
              payments: true,
              application: true
            }
          },
          auditLogs: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
              }
            }
          }
        }
      });

      const patterns = behaviorData.map(customer => {
        const loans = customer.activeLoans;
        const totalLoans = loans.length;
        const totalPayments = loans.reduce((sum, loan) => sum + loan.payments.length, 0);
        const avgLoanAmount = loans.reduce((sum, loan) => sum + parseFloat(loan.principalAmount), 0) / Math.max(totalLoans, 1);
        
        // Payment behavior
        const onTimePayments = loans.reduce((sum, loan) => {
          return sum + loan.payments.filter(payment => {
            const dueDate = new Date(payment.dueDate || payment.paymentDate);
            const paymentDate = new Date(payment.paymentDate);
            return paymentDate <= dueDate;
          }).length;
        }, 0);

        const paymentPunctuality = totalPayments > 0 ? onTimePayments / totalPayments : 0;

        // App usage patterns
        const appUsageFrequency = customer.auditLogs.length;
        const avgSessionsPerWeek = appUsageFrequency / 12; // 90 days = ~12 weeks

        // Loan application patterns
        const avgTimeBetweenLoans = totalLoans > 1 ? 
          (new Date(loans[0].createdAt) - new Date(loans[totalLoans - 1].createdAt)) / (totalLoans - 1) / (1000 * 60 * 60 * 24) : 0;

        return {
          customerId: customer.userId,
          customerName: `${customer.firstName} ${customer.lastName}`,
          totalLoans,
          avgLoanAmount,
          paymentPunctuality: Math.round(paymentPunctuality * 100),
          appUsageFrequency,
          avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10,
          avgTimeBetweenLoans: Math.round(avgTimeBetweenLoans),
          customerScore: this.calculateCustomerScore(paymentPunctuality, appUsageFrequency, totalLoans),
          segment: this.determineCustomerSegment(paymentPunctuality, avgLoanAmount, totalLoans)
        };
      });

      return {
        totalCustomers: patterns.length,
        segments: {
          premium: patterns.filter(p => p.segment === 'PREMIUM').length,
          regular: patterns.filter(p => p.segment === 'REGULAR').length,
          basic: patterns.filter(p => p.segment === 'BASIC').length,
          risk: patterns.filter(p => p.segment === 'RISK').length
        },
        averageMetrics: {
          paymentPunctuality: Math.round(patterns.reduce((sum, p) => sum + p.paymentPunctuality, 0) / patterns.length),
          appUsage: Math.round(patterns.reduce((sum, p) => sum + p.avgSessionsPerWeek, 0) / patterns.length * 10) / 10,
          loanAmount: Math.round(patterns.reduce((sum, p) => sum + p.avgLoanAmount, 0) / patterns.length)
        },
        customers: patterns.sort((a, b) => b.customerScore - a.customerScore)
      };
    } catch (error) {
      throw new Error(`Customer behavior analysis failed: ${error.message}`);
    }
  }

  calculateCustomerScore(punctuality, appUsage, loanCount) {
    let score = 0;
    score += punctuality * 40; // 40% weight for payment punctuality
    score += Math.min(appUsage / 10, 1) * 30; // 30% weight for app usage
    score += Math.min(loanCount / 5, 1) * 20; // 20% weight for loan history
    score += 10; // 10% base score
    return Math.round(score);
  }

  determineCustomerSegment(punctuality, avgLoanAmount, loanCount) {
    if (punctuality >= 0.9 && avgLoanAmount >= 100000 && loanCount >= 3) {
      return 'PREMIUM';
    } else if (punctuality >= 0.7 && avgLoanAmount >= 50000) {
      return 'REGULAR';
    } else if (punctuality < 0.5) {
      return 'RISK';
    } else {
      return 'BASIC';
    }
  }

  // Gold price trend correlation
  async getGoldPriceCorrelation() {
    try {
      // Get loan applications with gold value over time
      const loanData = await prisma.loanApplication.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Last year
          },
          estimatedValue: { not: null }
        },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          estimatedValue: true,
          totalWeight: true,
          requestedAmount: true
        }
      });

      // Group by month
      const monthlyData = {};
      loanData.forEach(loan => {
        const monthKey = loan.createdAt.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            totalApplications: 0,
            totalGoldValue: 0,
            totalGoldWeight: 0,
            totalRequestedAmount: 0
          };
        }
        monthlyData[monthKey].totalApplications += 1;
        monthlyData[monthKey].totalGoldValue += parseFloat(loan.estimatedValue);
        monthlyData[monthKey].totalGoldWeight += parseFloat(loan.totalWeight || 0);
        monthlyData[monthKey].totalRequestedAmount += parseFloat(loan.requestedAmount);
      });

      // Calculate monthly averages and trends
      const trends = Object.entries(monthlyData).map(([month, data]) => ({
        month,
        avgGoldPricePerGram: data.totalGoldWeight > 0 ? data.totalGoldValue / data.totalGoldWeight : 0,
        totalApplications: data.totalApplications,
        avgLoanToValue: data.totalGoldValue > 0 ? (data.totalRequestedAmount / data.totalGoldValue) * 100 : 0,
        totalVolume: data.totalRequestedAmount
      }));

      return {
        monthlyTrends: trends,
        correlationInsights: this.generateGoldPriceInsights(trends)
      };
    } catch (error) {
      throw new Error(`Gold price correlation analysis failed: ${error.message}`);
    }
  }

  generateGoldPriceInsights(trends) {
    const insights = [];
    
    if (trends.length >= 3) {
      const recent = trends.slice(-3);
      const avgApplications = recent.reduce((sum, t) => sum + t.totalApplications, 0) / recent.length;
      const avgLTV = recent.reduce((sum, t) => sum + t.avgLoanToValue, 0) / recent.length;

      if (avgApplications > 50) {
        insights.push('High application volume in recent months indicates strong market demand');
      }
      
      if (avgLTV > 75) {
        insights.push('High loan-to-value ratios suggest competitive gold valuation');
      } else if (avgLTV < 60) {
        insights.push('Conservative loan-to-value ratios indicate risk-averse lending');
      }

      // Trend analysis
      const earlyTrends = trends.slice(0, Math.floor(trends.length / 2));
      const lateTrends = trends.slice(Math.floor(trends.length / 2));
      
      const earlyAvgPrice = earlyTrends.reduce((sum, t) => sum + t.avgGoldPricePerGram, 0) / earlyTrends.length;
      const lateAvgPrice = lateTrends.reduce((sum, t) => sum + t.avgGoldPricePerGram, 0) / lateTrends.length;
      
      const priceGrowth = ((lateAvgPrice - earlyAvgPrice) / earlyAvgPrice) * 100;
      
      if (priceGrowth > 10) {
        insights.push(`Gold prices have increased by ${priceGrowth.toFixed(1)}% - favorable for new loans`);
      } else if (priceGrowth < -10) {
        insights.push(`Gold prices have decreased by ${Math.abs(priceGrowth).toFixed(1)}% - review valuation policies`);
      }
    }

    return insights;
  }

  // Field agent performance analytics
  async getFieldAgentPerformance() {
    try {
      const agents = await prisma.user.findMany({
        where: { userType: 'EMPLOYEE' },
        include: {
          employeeDetails: true,
          fieldAgentApplications: {
            include: {
              payments: true
            },
            where: {
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
              }
            }
          },
          collectedPayments: {
            where: {
              paymentDate: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
              }
            }
          }
        }
      });

      const performance = agents.map(agent => {
        const applications = agent.fieldAgentApplications;
        const payments = agent.collectedPayments;
        
        const approvedApplications = applications.filter(app => app.applicationStatus === 'APPROVED').length;
        const totalApplications = applications.length;
        const approvalRate = totalApplications > 0 ? (approvedApplications / totalApplications) * 100 : 0;
        
        const totalCollections = payments.reduce((sum, payment) => sum + parseFloat(payment.paymentAmount), 0);
        const avgCollectionPerVisit = payments.length > 0 ? totalCollections / payments.length : 0;
        
        // Performance score calculation
        const performanceScore = this.calculateAgentPerformanceScore(
          approvalRate,
          totalApplications,
          totalCollections,
          payments.length
        );

        return {
          agentId: agent.userId,
          agentName: `${agent.firstName} ${agent.lastName}`,
          employeeId: agent.employeeDetails?.employeeId,
          department: agent.employeeDetails?.department,
          totalApplications,
          approvedApplications,
          approvalRate: Math.round(approvalRate),
          totalCollections,
          totalPaymentVisits: payments.length,
          avgCollectionPerVisit: Math.round(avgCollectionPerVisit),
          performanceScore,
          performanceGrade: this.getPerformanceGrade(performanceScore)
        };
      });

      return {
        totalAgents: performance.length,
        performanceDistribution: {
          excellent: performance.filter(p => p.performanceGrade === 'A').length,
          good: performance.filter(p => p.performanceGrade === 'B').length,
          average: performance.filter(p => p.performanceGrade === 'C').length,
          needsImprovement: performance.filter(p => p.performanceGrade === 'D').length
        },
        topPerformers: performance.sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 5),
        agents: performance.sort((a, b) => b.performanceScore - a.performanceScore)
      };
    } catch (error) {
      throw new Error(`Agent performance analysis failed: ${error.message}`);
    }
  }

  calculateAgentPerformanceScore(approvalRate, applications, collections, visits) {
    let score = 0;
    
    // Approval rate (30% weight)
    score += (approvalRate / 100) * 30;
    
    // Application volume (25% weight)
    score += Math.min(applications / 20, 1) * 25;
    
    // Collection efficiency (25% weight)
    score += Math.min(collections / 500000, 1) * 25;
    
    // Visit productivity (20% weight)
    score += Math.min(visits / 30, 1) * 20;
    
    return Math.round(score);
  }

  getPerformanceGrade(score) {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  }

  // Revenue forecasting
  async getRevenueForecast(months = 6) {
    try {
      // Get historical data for the last 12 months
      const historicalData = await prisma.activeLoan.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          payments: true
        }
      });

      // Calculate monthly revenue and trends
      const monthlyRevenue = {};
      
      historicalData.forEach(loan => {
        loan.payments.forEach(payment => {
          const monthKey = payment.paymentDate.toISOString().substring(0, 7);
          if (!monthlyRevenue[monthKey]) {
            monthlyRevenue[monthKey] = 0;
          }
          monthlyRevenue[monthKey] += parseFloat(payment.interestPayment || 0);
        });
      });

      const sortedMonths = Object.entries(monthlyRevenue).sort();
      const revenueValues = sortedMonths.map(([_, revenue]) => revenue);
      
      // Simple linear regression for forecasting
      const forecast = this.generateRevenueForecast(revenueValues, months);
      
      return {
        historicalRevenue: sortedMonths.map(([month, revenue]) => ({
          month,
          revenue: Math.round(revenue)
        })),
        forecast: forecast,
        insights: this.generateRevenueInsights(revenueValues, forecast)
      };
    } catch (error) {
      throw new Error(`Revenue forecast failed: ${error.message}`);
    }
  }

  generateRevenueForecast(historicalData, months) {
    if (historicalData.length < 3) {
      return Array(months).fill().map((_, i) => ({
        month: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 7),
        forecastRevenue: historicalData[historicalData.length - 1] || 0,
        confidence: 'LOW'
      }));
    }

    // Calculate trend
    const n = historicalData.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = historicalData.reduce((sum, val) => sum + val, 0);
    const sumXY = historicalData.reduce((sum, val, i) => sum + val * (i + 1), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const forecast = [];
    const lastDataPoint = historicalData[historicalData.length - 1];
    
    for (let i = 1; i <= months; i++) {
      const forecastValue = intercept + slope * (n + i);
      const month = new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 7);
      
      forecast.push({
        month,
        forecastRevenue: Math.max(0, Math.round(forecastValue)),
        confidence: i <= 3 ? 'HIGH' : i <= 6 ? 'MEDIUM' : 'LOW'
      });
    }

    return forecast;
  }

  generateRevenueInsights(historical, forecast) {
    const insights = [];
    
    if (historical.length >= 3) {
      const recentTrend = historical.slice(-3);
      const avgGrowth = ((recentTrend[2] - recentTrend[0]) / recentTrend[0]) * 100;
      
      if (avgGrowth > 10) {
        insights.push(`Strong revenue growth trend of ${avgGrowth.toFixed(1)}% in recent months`);
      } else if (avgGrowth < -10) {
        insights.push(`Revenue decline of ${Math.abs(avgGrowth).toFixed(1)}% requires attention`);
      }
    }

    const totalForecast = forecast.reduce((sum, f) => sum + f.forecastRevenue, 0);
    insights.push(`Projected revenue for next ${forecast.length} months: ₹${totalForecast.toLocaleString()}`);

    const highConfidenceForecast = forecast.filter(f => f.confidence === 'HIGH');
    if (highConfidenceForecast.length > 0) {
      const avgHighConfidence = highConfidenceForecast.reduce((sum, f) => sum + f.forecastRevenue, 0) / highConfidenceForecast.length;
      insights.push(`High confidence monthly average: ₹${Math.round(avgHighConfidence).toLocaleString()}`);
    }

    return insights;
  }

  // Comprehensive analytics dashboard data
  async getDashboardAnalytics() {
    try {
      const [
        defaultPrediction,
        customerBehavior,
        goldPriceCorrelation,
        agentPerformance,
        revenueForecast
      ] = await Promise.all([
        this.getLoanDefaultPrediction(),
        this.getCustomerBehaviorPatterns(),
        this.getGoldPriceCorrelation(),
        this.getFieldAgentPerformance(),
        this.getRevenueForecast()
      ]);

      return {
        generatedAt: new Date().toISOString(),
        summary: {
          totalHighRiskLoans: defaultPrediction.highRiskLoans,
          averageCustomerScore: Math.round(customerBehavior.customers.reduce((sum, c) => sum + c.customerScore, 0) / customerBehavior.customers.length),
          topPerformingAgents: agentPerformance.topPerformers.length,
          projectedRevenue: revenueForecast.forecast[0]?.forecastRevenue || 0
        },
        riskAnalysis: defaultPrediction,
        customerInsights: customerBehavior,
        marketTrends: goldPriceCorrelation,
        teamPerformance: agentPerformance,
        businessForecasts: revenueForecast
      };
    } catch (error) {
      throw new Error(`Dashboard analytics failed: ${error.message}`);
    }
  }
}

module.exports = AdvancedAnalyticsService;