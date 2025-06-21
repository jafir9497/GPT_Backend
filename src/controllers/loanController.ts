import { Request, Response } from 'express';
import { AuthRequest } from '../types/express';
import { PrismaClient, ApplicationStatus, LoanStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getNotificationService } from '../services/notificationService';
import { loanWorkflowService } from '../services/loanWorkflowService';
import { KYCService } from '../services/kycService';

const prisma = new PrismaClient();
const kycService = new KYCService();

// Create a new loan application
export const createLoanApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      loanAmount,
      loanPurpose,
      loanTenureMonths,
      goldItems,
      goldTotalWeight,
      goldTotalValue,
      customerLocation,
      preferredVisitDate,
      preferredVisitTime,
      additionalNotes
    } = req.body;

    const userId = req.user!.userId;

    // Check KYC verification first
    const isKYCVerified = await kycService.isKYCVerified(userId);
    if (!isKYCVerified) {
      const kycErrors = await kycService.getKYCValidationErrors(userId);
      res.status(400).json({
        success: false,
        error: {
          code: 'KYC_NOT_VERIFIED',
          message: 'KYC verification is required before applying for a loan',
          details: {
            kycErrors,
            canProceed: false
          }
        }
      });
      return;
    }

    // Validate required fields
    if (!loanAmount || !loanPurpose || !goldItems || goldItems.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }

    // Generate application number
    const applicationNumber = `GLN${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create loan application
    const application = await prisma.loanApplication.create({
      data: {
        applicationNumber,
        customerId: userId,
        requestedAmount: parseFloat(loanAmount),
        loanPurpose,
        goldItems: JSON.stringify(goldItems),
        totalWeight: parseFloat(goldTotalWeight),
        estimatedValue: parseFloat(goldTotalValue),
        applicationStatus: ApplicationStatus.SUBMITTED,
        createdBy: userId
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        }
      }
    });

    // Initialize workflow for the application
    try {
      await loanWorkflowService.initializeWorkflow(application.applicationId);
    } catch (workflowError) {
      console.error('Workflow initialization error:', workflowError);
      // Continue even if workflow fails - it can be initialized manually
    }

    res.status(201).json({
      success: true,
      data: {
        application,
        message: 'Loan application submitted successfully and workflow initiated'
      }
    });

  } catch (error) {
    console.error('Create loan application error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create loan application'
      }
    });
  }
};

// Get loan applications for a customer
export const getCustomerApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 10, status } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const whereClause: any = {
      customerId: userId
    };

    if (status) {
      whereClause.applicationStatus = status;
    }

    const applications = await prisma.loanApplication.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        activeLoan: {
          select: {
            loanId: true,
            loanNumber: true,
            loanStatus: true,
            totalOutstanding: true,
            nextDueDate: true
          }
        }
      }
    });

    const total = await prisma.loanApplication.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        applications,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Get customer applications error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve applications'
      }
    });
  }
};

// Get application details
export const getApplicationDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.userId;

    const application = await prisma.loanApplication.findFirst({
      where: {
        applicationId,
        customerId: userId
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        },
        activeLoan: true
      }
    });

    if (!application) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Application not found'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: { application }
    });

  } catch (error) {
    console.error('Get application details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve application details'
      }
    });
  }
};

// Update application status (for employees/admin)
export const updateApplicationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const { status, remarks, assignedEmployee } = req.body;
    const userId = req.user!.userId;

    // Check if user has permission to update applications
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userType: true }
    });

    if (!user || !['EMPLOYEE', 'ADMIN'].includes(user.userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    const application = await prisma.loanApplication.update({
      where: { applicationId },
      data: {
        applicationStatus: status,
        fieldAgentId: assignedEmployee
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        application,
        message: 'Application status updated successfully'
      }
    });

  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update application status'
      }
    });
  }
};

// Get active loans for a customer
export const getActiveLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const activeLoans = await prisma.activeLoan.findMany({
      where: {
        customerId: userId,
        loanStatus: {
          in: [LoanStatus.ACTIVE, LoanStatus.DEFAULTED]
        }
      },
      include: {
        application: {
          select: {
            applicationNumber: true,
            loanPurpose: true
          }
        },
        payments: {
          take: 5,
          orderBy: {
            paymentDate: 'desc'
          },
          select: {
            paymentId: true,
            paymentAmount: true,
            paymentDate: true,
            paymentStatus: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: { activeLoans }
    });

  } catch (error) {
    console.error('Get active loans error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve active loans'
      }
    });
  }
};

// Calculate loan eligibility
export const calculateLoanEligibility = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { goldWeight, goldPurity, goldType, currentGoldRate } = req.body;

    // Basic validation
    if (!goldWeight || !goldPurity || !currentGoldRate) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required parameters'
        }
      });
      return;
    }

    // Calculate gold value
    const goldValue = parseFloat(goldWeight) * parseFloat(currentGoldRate) * (parseFloat(goldPurity) / 100);
    
    // Loan-to-value ratio (typically 75-80% for gold loans)
    const ltvRatio = 0.75;
    const maxLoanAmount = goldValue * ltvRatio;
    
    // Interest rate calculation (example rates)
    const baseInterestRate = 12; // 12% per annum
    const interestRate = baseInterestRate + (goldPurity < 18 ? 1 : 0); // Higher rate for lower purity

    // Calculate EMI for different tenures
    const emiCalculations = [6, 12, 18, 24, 36].map(months => {
      const monthlyRate = interestRate / 12 / 100;
      const emi = (maxLoanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) / 
                  (Math.pow(1 + monthlyRate, months) - 1);
      
      return {
        tenure: months,
        emi: Math.round(emi * 100) / 100,
        totalAmount: Math.round(emi * months * 100) / 100
      };
    });

    res.json({
      success: true,
      data: {
        goldValue: Math.round(goldValue * 100) / 100,
        maxLoanAmount: Math.round(maxLoanAmount * 100) / 100,
        interestRate,
        ltvRatio: ltvRatio * 100,
        emiCalculations
      }
    });

  } catch (error) {
    console.error('Calculate loan eligibility error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to calculate loan eligibility'
      }
    });
  }
};

// Get loan application statistics (for admin/employee)
export const getLoanStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Check permissions
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userType: true }
    });

    if (!user || !['EMPLOYEE', 'ADMIN'].includes(user.userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    // Get application statistics
    const totalApplications = await prisma.loanApplication.count();
    const pendingApplications = await prisma.loanApplication.count({
      where: { applicationStatus: ApplicationStatus.SUBMITTED }
    });
    const approvedApplications = await prisma.loanApplication.count({
      where: { applicationStatus: ApplicationStatus.APPROVED }
    });
    const activeLoans = await prisma.activeLoan.count({
      where: { loanStatus: LoanStatus.ACTIVE }
    });

    // Get total loan amount disbursed
    const totalDisbursed = await prisma.activeLoan.aggregate({
      _sum: {
        principalAmount: true
      }
    });

    // Get monthly statistics
    const currentMonth = new Date();
    currentMonth.setDate(1);
    
    const monthlyApplications = await prisma.loanApplication.count({
      where: {
        createdAt: {
          gte: currentMonth
        }
      }
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalApplications,
          pendingApplications,
          approvedApplications,
          activeLoans,
          totalDisbursed: totalDisbursed._sum.principalAmount || 0,
          monthlyApplications
        }
      }
    });

  } catch (error) {
    console.error('Get loan statistics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve loan statistics'
      }
    });
  }
};

// Get detailed loan information by loan ID
export const getLoanDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;
    const userId = req.user!.userId;

    // Get loan with all related information
    const loan = await prisma.activeLoan.findUnique({
      where: { loanId },
      include: {
        customer: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        },
        application: {
          select: {
            applicationNumber: true,
            loanPurpose: true,
            goldItems: true,
            totalWeight: true,
            estimatedValue: true,
            purityDetails: true,
            appraisalPhotos: true,
            verificationDate: true,
            verificationStatus: true,
            fieldAgent: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            }
          }
        },
        payments: {
          orderBy: {
            paymentDate: 'desc'
          },
          select: {
            paymentId: true,
            paymentNumber: true,
            paymentAmount: true,
            paymentDate: true,
            paymentMethod: true,
            paymentStatus: true,
            principalPayment: true,
            interestPayment: true,
            penaltyPayment: true,
            receiptNumber: true
          }
        },
        documents: {
          where: {
            isActive: true
          },
          select: {
            documentId: true,
            documentType: true,
            title: true,
            fileName: true,
            generatedAt: true
          }
        }
      }
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: {
          code: 'LOAN_NOT_FOUND',
          message: 'Loan not found'
        }
      });
      return;
    }

    // Check if user has permission to access this loan
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userType: true }
    });

    const hasAccess = loan.customerId === userId || 
                     ['EMPLOYEE', 'ADMIN'].includes(user?.userType || '');

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    // Calculate derived values
    const totalPaid = loan.payments.reduce((sum, payment) => 
      sum + parseFloat(payment.paymentAmount.toString()), 0
    );

    const nextEMIDate = loan.nextDueDate;
    const daysOverdue = nextEMIDate && nextEMIDate < new Date() 
      ? Math.floor((new Date().getTime() - nextEMIDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Calculate interest accrued
    const daysSinceLastPayment = loan.lastPaymentDate 
      ? Math.floor((new Date().getTime() - loan.lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((new Date().getTime() - loan.loanStartDate.getTime()) / (1000 * 60 * 60 * 24));

    const dailyInterestRate = parseFloat(loan.interestRate.toString()) / 365 / 100;
    const accruedInterest = parseFloat(loan.outstandingPrincipal.toString()) * dailyInterestRate * daysSinceLastPayment;

    res.json({
      success: true,
      data: {
        loan: {
          ...loan,
          derivedInfo: {
            totalPaid,
            daysOverdue,
            accruedInterest: Math.round(accruedInterest * 100) / 100,
            loanToValueRatio: loan.application?.estimatedValue 
              ? (parseFloat(loan.principalAmount.toString()) / parseFloat(loan.application.estimatedValue.toString()) * 100).toFixed(2)
              : null,
            remainingTenure: loan.loanEndDate 
              ? Math.max(0, Math.ceil((loan.loanEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30)))
              : null
          }
        }
      }
    });

  } catch (error) {
    console.error('Get loan details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve loan details'
      }
    });
  }
};

// Generate and download loan statement
export const generateLoanStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;
    const { fromDate, toDate } = req.query;
    const userId = req.user!.userId;

    // Get loan information
    const loan = await prisma.activeLoan.findUnique({
      where: { loanId },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true
          }
        },
        application: {
          select: {
            applicationNumber: true,
            loanPurpose: true,
            goldItems: true,
            totalWeight: true,
            estimatedValue: true
          }
        },
        payments: {
          where: fromDate && toDate ? {
            paymentDate: {
              gte: new Date(fromDate as string),
              lte: new Date(toDate as string)
            }
          } : {},
          orderBy: {
            paymentDate: 'desc'
          }
        }
      }
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: {
          code: 'LOAN_NOT_FOUND',
          message: 'Loan not found'
        }
      });
      return;
    }

    // Check access permissions
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userType: true }
    });

    const hasAccess = loan.customerId === userId || 
                     ['EMPLOYEE', 'ADMIN'].includes(user?.userType || '');

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      });
      return;
    }

    // Generate upcoming EMIs
    const upcomingEMIs = [];
    if (loan.emiAmount && loan.nextDueDate) {
      const currentDate = new Date(loan.nextDueDate);
      for (let i = 0; i < 6; i++) { // Next 6 EMIs
        upcomingEMIs.push({
          dueDate: new Date(currentDate).toISOString().split('T')[0],
          amount: parseFloat(loan.emiAmount.toString()),
          principalComponent: parseFloat(loan.emiAmount.toString()) * 0.7, // Approximate
          interestComponent: parseFloat(loan.emiAmount.toString()) * 0.3   // Approximate
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // Prepare statement data
    const statementData = {
      loanId: loan.loanId,
      loanNumber: loan.loanNumber,
      customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
      customerPhone: loan.customer.phoneNumber,
      customerAddress: [
        loan.customer.addressLine1,
        loan.customer.addressLine2,
        loan.customer.city,
        loan.customer.state,
        loan.customer.postalCode
      ].filter(Boolean).join(', '),
      loanAmount: parseFloat(loan.principalAmount.toString()),
      interestRate: parseFloat(loan.interestRate.toString()),
      startDate: loan.loanStartDate.toISOString(),
      maturityDate: loan.loanEndDate.toISOString(),
      currentBalance: parseFloat(loan.totalOutstanding.toString()),
      totalPaid: loan.payments.reduce((sum, payment) => 
        sum + parseFloat(payment.paymentAmount.toString()), 0
      ),
      paymentHistory: loan.payments.map(payment => ({
        date: payment.paymentDate.toISOString().split('T')[0],
        amount: parseFloat(payment.paymentAmount.toString()),
        method: payment.paymentMethod,
        receiptNumber: payment.receiptNumber,
        principal: parseFloat(payment.principalPayment.toString()),
        interest: parseFloat(payment.interestPayment.toString()),
        penalty: parseFloat(payment.penaltyPayment.toString())
      })),
      goldDetails: {
        items: loan.application?.goldItems ? JSON.parse(loan.application.goldItems as string) : [],
        totalWeight: loan.application?.totalWeight ? parseFloat(loan.application.totalWeight.toString()) : 0,
        estimatedValue: loan.application?.estimatedValue ? parseFloat(loan.application.estimatedValue.toString()) : 0
      },
      statementPeriod: {
        from: fromDate ? new Date(fromDate as string).toISOString() : loan.loanStartDate.toISOString(),
        to: toDate ? new Date(toDate as string).toISOString() : new Date().toISOString()
      },
      upcomingEMIs,
      generatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        statement: statementData,
        downloadUrl: `/api/v1/documents/generate/loan-statement`,
        message: 'Loan statement generated successfully'
      }
    });

  } catch (error) {
    console.error('Generate loan statement error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to generate loan statement'
      }
    });
  }
};