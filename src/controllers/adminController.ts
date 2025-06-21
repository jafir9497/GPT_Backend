import { Request, Response } from 'express';
import { PrismaClient, UserType, ApplicationStatus, LoanStatus, PaymentStatus } from '@prisma/client';
import { AuthRequest } from '../types/express';

const prisma = new PrismaClient();

// Get admin dashboard overview
export const getDashboardOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.userType;

    // Check admin permissions
    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    // Get current date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // User statistics
    const totalUsers = await prisma.user.count();
    const totalCustomers = await prisma.user.count({
      where: { userType: UserType.CUSTOMER }
    });
    const totalEmployees = await prisma.user.count({
      where: { userType: UserType.EMPLOYEE }
    });
    const newUsersThisMonth = await prisma.user.count({
      where: {
        createdAt: { gte: startOfMonth },
        userType: UserType.CUSTOMER
      }
    });

    // Loan statistics
    const totalApplications = await prisma.loanApplication.count();
    const pendingApplications = await prisma.loanApplication.count({
      where: { applicationStatus: ApplicationStatus.SUBMITTED }
    });
    const approvedApplications = await prisma.loanApplication.count({
      where: { applicationStatus: ApplicationStatus.APPROVED }
    });
    const rejectedApplications = await prisma.loanApplication.count({
      where: { applicationStatus: ApplicationStatus.REJECTED }
    });

    // Active loans
    const activeLoans = await prisma.activeLoan.count({
      where: { loanStatus: LoanStatus.ACTIVE }
    });
    const overdueLoans = await prisma.activeLoan.count({
      where: {
        loanStatus: LoanStatus.ACTIVE,
        nextDueDate: { lt: now }
      }
    });

    // Financial statistics
    const totalDisbursed = await prisma.activeLoan.aggregate({
      _sum: { principalAmount: true }
    });
    const totalOutstanding = await prisma.activeLoan.aggregate({
      _sum: { totalOutstanding: true },
      where: { loanStatus: LoanStatus.ACTIVE }
    });
    const totalCollected = await prisma.payment.aggregate({
      _sum: { paymentAmount: true },
      where: { paymentStatus: PaymentStatus.COMPLETED }
    });

    // Monthly trends
    const monthlyApplications = await prisma.loanApplication.groupBy({
      by: ['createdAt'],
      _count: { applicationId: true },
      where: {
        createdAt: { gte: startOfYear }
      },
      orderBy: { createdAt: 'asc' }
    });

    const monthlyDisbursements = await prisma.activeLoan.groupBy({
      by: ['createdAt'],
      _sum: { principalAmount: true },
      _count: { loanId: true },
      where: {
        createdAt: { gte: startOfYear }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Recent activities
    const recentApplications = await prisma.loanApplication.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
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

    const recentPayments = await prisma.payment.findMany({
      take: 5,
      orderBy: { paymentDate: 'desc' },
      include: {
        loan: {
          select: {
            loanNumber: true,
            customer: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    // Performance metrics
    const applicationApprovalRate = totalApplications > 0 
      ? ((approvedApplications / totalApplications) * 100).toFixed(2)
      : 0;

    const avgLoanAmount = await prisma.activeLoan.aggregate({
      _avg: { principalAmount: true }
    });

    const avgProcessingTime = await prisma.loanApplication.findMany({
      where: {
        submittedAt: { not: null },
        approvedAt: { not: null }
      },
      select: {
        submittedAt: true,
        approvedAt: true
      }
    });

    let avgProcessingDays = 0;
    if (avgProcessingTime.length > 0) {
      const totalDays = avgProcessingTime.reduce((sum, app) => {
        if (app.submittedAt && app.approvedAt) {
          const daysDiff = Math.floor(
            (app.approvedAt.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          return sum + daysDiff;
        }
        return sum;
      }, 0);
      avgProcessingDays = Math.round(totalDays / avgProcessingTime.length);
    }

    res.json({
      success: true,
      data: {
        overview: {
          users: {
            total: totalUsers,
            customers: totalCustomers,
            employees: totalEmployees,
            newThisMonth: newUsersThisMonth
          },
          loans: {
            totalApplications,
            pendingApplications,
            approvedApplications,
            rejectedApplications,
            activeLoans,
            overdueLoans
          },
          financial: {
            totalDisbursed: totalDisbursed._sum.principalAmount || 0,
            totalOutstanding: totalOutstanding._sum.totalOutstanding || 0,
            totalCollected: totalCollected._sum.paymentAmount || 0
          },
          performance: {
            approvalRate: applicationApprovalRate,
            avgLoanAmount: avgLoanAmount._avg.principalAmount || 0,
            avgProcessingDays
          }
        },
        trends: {
          monthlyApplications,
          monthlyDisbursements
        },
        recentActivity: {
          applications: recentApplications,
          payments: recentPayments
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve dashboard overview'
      }
    });
  }
};

// Get all loan applications with filters
export const getAllApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN && userRole !== UserType.EMPLOYEE) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    const {
      page = 1,
      limit = 10,
      status,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};

    if (status) {
      whereClause.applicationStatus = status;
    }

    if (search) {
      whereClause.OR = [
        { applicationNumber: { contains: search as string, mode: 'insensitive' } },
        { customer: { firstName: { contains: search as string, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search as string, mode: 'insensitive' } } },
        { customer: { phoneNumber: { contains: search as string } } }
      ];
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(endDate as string);
      }
    }

    if (minAmount || maxAmount) {
      whereClause.requestedAmount = {};
      if (minAmount) {
        whereClause.requestedAmount.gte = parseFloat(minAmount as string);
      }
      if (maxAmount) {
        whereClause.requestedAmount.lte = parseFloat(maxAmount as string);
      }
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const applications = await prisma.loanApplication.findMany({
      where: whereClause,
      skip,
      take,
      orderBy,
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        },
        fieldAgent: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        },
        activeLoan: {
          select: {
            loanId: true,
            loanNumber: true,
            loanStatus: true,
            totalOutstanding: true
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
    console.error('Get all applications error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve applications'
      }
    });
  }
};

// Get all active loans with filters
export const getAllActiveLoans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN && userRole !== UserType.EMPLOYEE) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    const {
      page = 1,
      limit = 10,
      status,
      search,
      overdue = false,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};

    if (status) {
      whereClause.loanStatus = status;
    }

    if (overdue === 'true') {
      whereClause.nextDueDate = { lt: new Date() };
      whereClause.loanStatus = LoanStatus.ACTIVE;
    }

    if (search) {
      whereClause.OR = [
        { loanNumber: { contains: search as string, mode: 'insensitive' } },
        { customer: { firstName: { contains: search as string, mode: 'insensitive' } } },
        { customer: { lastName: { contains: search as string, mode: 'insensitive' } } },
        { customer: { phoneNumber: { contains: search as string } } }
      ];
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const loans = await prisma.activeLoan.findMany({
      where: whereClause,
      skip,
      take,
      orderBy,
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true
          }
        },
        application: {
          select: {
            applicationNumber: true,
            loanPurpose: true
          }
        },
        payments: {
          take: 3,
          orderBy: { paymentDate: 'desc' },
          select: {
            paymentId: true,
            paymentAmount: true,
            paymentDate: true,
            paymentStatus: true
          }
        }
      }
    });

    const total = await prisma.activeLoan.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        loans,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Get all active loans error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve active loans'
      }
    });
  }
};

// Get all users with filters
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const {
      page = 1,
      limit = 10,
      userType,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};

    if (userType) {
      whereClause.userType = userType;
    }

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { phoneNumber: { contains: search as string } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Build order by clause
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const users = await prisma.user.findMany({
      where: whereClause,
      skip,
      take,
      orderBy,
      select: {
        userId: true,
        phoneNumber: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        employeeDetails: {
          select: {
            employeeId: true,
            department: true,
            designation: true,
            employmentStatus: true
          }
        },
        customerApplications: {
          select: {
            applicationId: true
          }
        },
        activeLoans: {
          select: {
            loanId: true
          }
        }
      }
    });

    const total = await prisma.user.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve users'
      }
    });
  }
};

// Update application status
export const updateApplicationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const { status, remarks, assignedFieldAgent } = req.body;
    const userId = req.user!.userId;
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN && userRole !== UserType.EMPLOYEE) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    const updateData: any = {
      applicationStatus: status,
      updatedAt: new Date()
    };

    if (remarks) {
      updateData.verificationNotes = remarks;
    }

    if (assignedFieldAgent) {
      updateData.fieldAgentId = assignedFieldAgent;
    }

    if (status === ApplicationStatus.APPROVED) {
      updateData.approvedAt = new Date();
    }

    const application = await prisma.loanApplication.update({
      where: { applicationId },
      data: updateData,
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

// Update user status
export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;
    const { status, reason } = req.body;
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const user = await prisma.user.update({
      where: { userId: targetUserId },
      data: {
        status,
        updatedAt: new Date()
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        userType: true,
        status: true
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        tableName: 'users',
        recordId: targetUserId,
        action: 'UPDATE',
        newValues: { status, reason },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    res.json({
      success: true,
      data: {
        user,
        message: 'User status updated successfully'
      }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update user status'
      }
    });
  }
};

// Get system analytics
export const getSystemAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Daily application trends
    const dailyApplications = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM loan_applications 
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Daily disbursement trends
    const dailyDisbursements = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as loan_count,
        SUM(principal_amount) as total_amount
      FROM active_loans 
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Payment collection trends
    const dailyCollections = await prisma.$queryRaw`
      SELECT 
        DATE(payment_date) as date,
        COUNT(*) as payment_count,
        SUM(payment_amount) as total_amount
      FROM payments 
      WHERE payment_date >= ${startDate}
        AND payment_status = 'COMPLETED'
      GROUP BY DATE(payment_date)
      ORDER BY date ASC
    `;

    // Top performing regions/agents
    const topAgents = await prisma.user.findMany({
      where: {
        userType: UserType.EMPLOYEE,
        fieldAgentApplications: {
          some: {
            createdAt: { gte: startDate },
            applicationStatus: ApplicationStatus.APPROVED
          }
        }
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        fieldAgentApplications: {
          where: {
            createdAt: { gte: startDate },
            applicationStatus: ApplicationStatus.APPROVED
          },
          select: {
            requestedAmount: true
          }
        }
      },
      take: 10
    });

    res.json({
      success: true,
      data: {
        trends: {
          applications: dailyApplications,
          disbursements: dailyDisbursements,
          collections: dailyCollections
        },
        performance: {
          topAgents: topAgents.map(agent => ({
            ...agent,
            totalApplications: agent.fieldAgentApplications.length,
            totalAmount: agent.fieldAgentApplications.reduce(
              (sum, app) => sum + Number(app.requestedAmount), 0
            )
          }))
        }
      }
    });

  } catch (error) {
    console.error('Get system analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve analytics'
      }
    });
  }
};

// Create employee account
export const createEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      phoneNumber,
      email,
      firstName,
      lastName,
      department,
      designation,
      reportingManagerId
    } = req.body;

    const userRole = req.user!.userType;

    if (userRole !== UserType.ADMIN && userRole !== UserType.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber }
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this phone number already exists'
        }
      });
      return;
    }

    // Create user and employee details in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phoneNumber,
          email,
          firstName,
          lastName,
          userType: UserType.EMPLOYEE
        }
      });

      const employeeDetails = await tx.employeeDetail.create({
        data: {
          employeeId: `EMP${Date.now()}`,
          userId: user.userId,
          department,
          designation,
          reportingManagerId,
          employmentStartDate: new Date()
        }
      });

      return { user, employeeDetails };
    });

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        employeeDetails: result.employeeDetails,
        message: 'Employee created successfully'
      }
    });

  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create employee'
      }
    });
  }
};