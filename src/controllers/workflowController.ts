import { Request, Response } from 'express';
import { AuthRequest } from '../types/express';
import { PrismaClient, UserType, WorkflowStepStatus } from '@prisma/client';
import { loanWorkflowService } from '../services/loanWorkflowService';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Get workflow status for an application
export const getWorkflowStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.userId;
    const userType = req.user!.userType;

    // Check if user has access to this application
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      select: { customerId: true, fieldAgentId: true }
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

    // Check access permissions
    const hasAccess = 
      userType === UserType.ADMIN || 
      userType === UserType.SUPER_ADMIN ||
      application.customerId === userId ||
      application.fieldAgentId === userId;

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

    const workflowStatus = await loanWorkflowService.getWorkflowStatus(applicationId);

    res.json({
      success: true,
      data: workflowStatus
    });

  } catch (error) {
    logger.error('Get workflow status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve workflow status'
      }
    });
  }
};

// Process workflow action
export const processWorkflowAction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const { actionType, remarks, data } = req.body;
    const userId = req.user!.userId;
    const userType = req.user!.userType;

    // Validate required fields
    if (!actionType) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Action type is required'
        }
      });
      return;
    }

    // Check if user has permission to perform workflow actions
    if (!['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'].includes(userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    const workflowAction = {
      applicationId,
      actionType,
      performedBy: userId,
      remarks,
      data
    };

    await loanWorkflowService.processWorkflowAction(workflowAction);

    res.json({
      success: true,
      data: {
        message: 'Workflow action processed successfully'
      }
    });

  } catch (error) {
    logger.error('Process workflow action error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process workflow action'
      }
    });
  }
};

// Initialize workflow for application
export const initializeWorkflow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const userType = req.user!.userType;

    // Check permissions
    if (!['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'].includes(userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
      return;
    }

    await loanWorkflowService.initializeWorkflow(applicationId);

    res.json({
      success: true,
      data: {
        message: 'Workflow initialized successfully'
      }
    });

  } catch (error) {
    logger.error('Initialize workflow error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to initialize workflow'
      }
    });
  }
};

// Get all applications with workflow status (for admin/employee)
export const getApplicationsWithWorkflow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userType = req.user!.userType;
    const userId = req.user!.userId;

    if (!['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'].includes(userType)) {
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
      step,
      assignedToMe = false
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};

    if (status) {
      whereClause.applicationStatus = status;
    }

    // Filter by assigned user if requested
    if (assignedToMe === 'true') {
      whereClause.OR = [
        { fieldAgentId: userId },
        { workflowSteps: { some: { assignedTo: userId, status: 'PENDING' } } }
      ];
    }

    // Filter by current workflow step
    if (step) {
      whereClause.workflowSteps = {
        some: {
          stepId: step,
          status: 'PENDING'
        }
      };
    }

    const applications = await prisma.loanApplication.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        },
        fieldAgent: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        workflowSteps: {
          orderBy: { stepOrder: 'asc' }
        }
      }
    });

    const total = await prisma.loanApplication.count({
      where: whereClause
    });

    // Enhance with workflow progress
    const enhancedApplications = applications.map(app => {
      const completedSteps = app.workflowSteps.filter(s => s.status === 'COMPLETED').length;
      const currentStep = app.workflowSteps.find(s => s.status === 'PENDING');
      
      return {
        ...app,
        workflowProgress: {
          completedSteps,
          totalSteps: app.workflowSteps.length,
          progressPercentage: app.workflowSteps.length > 0 
            ? Math.round((completedSteps / app.workflowSteps.length) * 100)
            : 0,
          currentStep: currentStep ? {
            stepId: currentStep.stepId,
            stepName: currentStep.stepName,
            assignedTo: currentStep.assignedTo,
            startedAt: currentStep.startedAt,
            timeoutAt: currentStep.timeoutAt
          } : null
        }
      };
    });

    res.json({
      success: true,
      data: {
        applications: enhancedApplications,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    logger.error('Get applications with workflow error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve applications'
      }
    });
  }
};

// Get workflow metrics (for admin)
export const getWorkflowMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userType = req.user!.userType;

    if (!['ADMIN', 'SUPER_ADMIN'].includes(userType)) {
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
    const endDate = new Date();

    const metrics = await loanWorkflowService.getWorkflowMetrics(startDate, endDate);

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    logger.error('Get workflow metrics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve workflow metrics'
      }
    });
  }
};

// Get my workflow tasks (for employees)
export const getMyWorkflowTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const userType = req.user!.userType;

    if (!['EMPLOYEE', 'ADMIN'].includes(userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Employee access required'
        }
      });
      return;
    }

    const {
      page = 1,
      limit = 10,
      status = 'PENDING'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const tasks = await prisma.workflowStep.findMany({
      where: {
        assignedTo: userId,
        status: status as WorkflowStepStatus
      },
      skip,
      take,
      orderBy: [
        { timeoutAt: 'asc' },
        { startedAt: 'asc' }
      ],
      include: {
        application: {
          include: {
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            }
          }
        }
      }
    });

    const total = await prisma.workflowStep.count({
      where: {
        assignedTo: userId,
        status: status as WorkflowStepStatus
      }
    });

    // Check for overdue tasks
    const overdueTasks = tasks.filter(task => 
      task.timeoutAt && task.timeoutAt < new Date()
    ).length;

    res.json({
      success: true,
      data: {
        tasks,
        summary: {
          total,
          overdue: overdueTasks,
          pending: tasks.length
        },
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    logger.error('Get my workflow tasks error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve workflow tasks'
      }
    });
  }
};