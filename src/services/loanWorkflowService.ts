import { PrismaClient, ApplicationStatus, UserType, LoanStatus, WorkflowStepStatus } from '@prisma/client';
import { getNotificationService } from './notificationService';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface WorkflowStep {
  stepId: string;
  stepName: string;
  stepOrder: number;
  requiredRole: UserType[];
  isRequired: boolean;
  timeoutHours?: number;
  autoApprove?: boolean;
  conditions?: any;
}

export interface WorkflowAction {
  applicationId: string;
  actionType: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'ASSIGN_AGENT' | 'VERIFY' | 'DISBURSE';
  performedBy: string;
  remarks?: string;
  data?: any;
}

export class LoanWorkflowService {
  private readonly workflowSteps: WorkflowStep[] = [
    {
      stepId: 'INITIAL_REVIEW',
      stepName: 'Initial Application Review',
      stepOrder: 1,
      requiredRole: [UserType.ADMIN, UserType.EMPLOYEE],
      isRequired: true,
      timeoutHours: 24,
      autoApprove: false
    },
    {
      stepId: 'DOCUMENT_VERIFICATION',
      stepName: 'Document Verification',
      stepOrder: 2,
      requiredRole: [UserType.ADMIN, UserType.EMPLOYEE],
      isRequired: true,
      timeoutHours: 48,
      autoApprove: false
    },
    {
      stepId: 'FIELD_VERIFICATION',
      stepName: 'Field Agent Verification',
      stepOrder: 3,
      requiredRole: [UserType.EMPLOYEE],
      isRequired: true,
      timeoutHours: 72,
      autoApprove: false
    },
    {
      stepId: 'CREDIT_ASSESSMENT',
      stepName: 'Credit Assessment',
      stepOrder: 4,
      requiredRole: [UserType.ADMIN],
      isRequired: true,
      timeoutHours: 24,
      autoApprove: false
    },
    {
      stepId: 'FINAL_APPROVAL',
      stepName: 'Final Approval',
      stepOrder: 5,
      requiredRole: [UserType.ADMIN, UserType.SUPER_ADMIN],
      isRequired: true,
      timeoutHours: 24,
      autoApprove: false
    },
    {
      stepId: 'LOAN_CREATION',
      stepName: 'Loan Account Creation',
      stepOrder: 6,
      requiredRole: [UserType.ADMIN],
      isRequired: true,
      timeoutHours: 24,
      autoApprove: true
    },
    {
      stepId: 'DISBURSEMENT',
      stepName: 'Fund Disbursement',
      stepOrder: 7,
      requiredRole: [UserType.ADMIN, UserType.SUPER_ADMIN],
      isRequired: true,
      timeoutHours: 48,
      autoApprove: false
    }
  ];

  // Initialize workflow for new application
  async initializeWorkflow(applicationId: string): Promise<void> {
    try {
      const application = await prisma.loanApplication.findUnique({
        where: { applicationId },
        include: { customer: true }
      });

      if (!application) {
        throw new Error('Application not found');
      }

      // Create workflow steps
      const workflowSteps = this.workflowSteps.map(step => ({
        applicationId,
        stepId: step.stepId,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        status: step.stepOrder === 1 ? WorkflowStepStatus.PENDING : WorkflowStepStatus.WAITING,
        assignedTo: null,
        startedAt: step.stepOrder === 1 ? new Date() : null,
        completedAt: null,
        timeoutAt: step.stepOrder === 1 && step.timeoutHours 
          ? new Date(Date.now() + step.timeoutHours * 60 * 60 * 1000) 
          : null,
        remarks: null,
        data: {}
      }));

      await prisma.workflowStep.createMany({
        data: workflowSteps
      });

      // Update application status
      await prisma.loanApplication.update({
        where: { applicationId },
        data: { 
          applicationStatus: ApplicationStatus.UNDER_REVIEW,
          submittedAt: new Date()
        }
      });

      // Notify reviewers
      await this.notifyNextStepReviewers(applicationId);

      logger.info(`Workflow initialized for application ${applicationId}`);
    } catch (error) {
      logger.error('Error initializing workflow:', error);
      throw error;
    }
  }

  // Process workflow action
  async processWorkflowAction(action: WorkflowAction): Promise<void> {
    try {
      const { applicationId, actionType, performedBy, remarks, data } = action;

      // Get current workflow step
      const currentStep = await prisma.workflowStep.findFirst({
        where: {
          applicationId,
          status: 'PENDING'
        },
        orderBy: { stepOrder: 'asc' }
      });

      if (!currentStep) {
        throw new Error('No pending workflow step found');
      }

      // Validate user permissions
      const user = await prisma.user.findUnique({
        where: { userId: performedBy },
        select: { userType: true, firstName: true, lastName: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const stepDefinition = this.workflowSteps.find(s => s.stepId === currentStep.stepId);
      if (!stepDefinition?.requiredRole.includes(user.userType)) {
        throw new Error('Insufficient permissions for this workflow step');
      }

      // Process the action
      switch (actionType) {
        case 'APPROVE':
          await this.approveStep(applicationId, currentStep, performedBy, remarks, data);
          break;
        case 'REJECT':
          await this.rejectApplication(applicationId, currentStep, performedBy, remarks || '');
          break;
        case 'REQUEST_INFO':
          await this.requestAdditionalInfo(applicationId, currentStep, performedBy, remarks || '', data);
          break;
        case 'ASSIGN_AGENT':
          await this.assignFieldAgent(applicationId, currentStep, performedBy, data?.agentId || '', remarks);
          break;
        case 'VERIFY':
          await this.verifyStep(applicationId, currentStep, performedBy, remarks || '', data);
          break;
        case 'DISBURSE':
          await this.disburseLoan(applicationId, currentStep, performedBy, remarks, data);
          break;
        default:
          throw new Error('Invalid action type');
      }

      // Log the action
      await this.logWorkflowAction(action, currentStep.stepId);

    } catch (error) {
      logger.error('Error processing workflow action:', error);
      throw error;
    }
  }

  // Approve current step and move to next
  private async approveStep(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    remarks?: string, 
    data?: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Complete current step
      await tx.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'COMPLETED',
          assignedTo: performedBy,
          completedAt: new Date(),
          remarks,
          data: data || {}
        }
      });

      // Check if this is the last step
      const nextStep = await tx.workflowStep.findFirst({
        where: {
          applicationId,
          stepOrder: currentStep.stepOrder + 1
        }
      });

      if (nextStep) {
        // Activate next step
        const stepDefinition = this.workflowSteps.find(s => s.stepId === nextStep.stepId);
        
        await tx.workflowStep.update({
          where: { id: nextStep.id },
          data: {
            status: 'PENDING',
            startedAt: new Date(),
            timeoutAt: stepDefinition?.timeoutHours 
              ? new Date(Date.now() + stepDefinition.timeoutHours * 60 * 60 * 1000)
              : null
          }
        });

        // Auto-approve if configured
        if (stepDefinition?.autoApprove) {
          await this.autoApproveStep(applicationId, nextStep);
        }
      } else {
        // All steps completed - approve application
        await tx.loanApplication.update({
          where: { applicationId },
          data: {
            applicationStatus: ApplicationStatus.APPROVED,
            approvedAt: new Date()
          }
        });

        // Notify customer of approval
        await this.notifyApplicationApproved(applicationId);
      }
    });

    // Notify next step reviewers
    await this.notifyNextStepReviewers(applicationId);
  }

  // Reject application
  private async rejectApplication(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    remarks: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Complete current step as rejected
      await tx.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'REJECTED',
          assignedTo: performedBy,
          completedAt: new Date(),
          remarks
        }
      });

      // Mark all remaining steps as cancelled
      await tx.workflowStep.updateMany({
        where: {
          applicationId,
          stepOrder: { gt: currentStep.stepOrder }
        },
        data: { status: 'CANCELLED' }
      });

      // Update application status
      await tx.loanApplication.update({
        where: { applicationId },
        data: {
          applicationStatus: ApplicationStatus.REJECTED,
          verificationNotes: remarks
        }
      });
    });

    // Notify customer of rejection
    await this.notifyApplicationRejected(applicationId, remarks);
  }

  // Request additional information
  private async requestAdditionalInfo(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    remarks: string,
    data?: any
  ): Promise<void> {
    await prisma.workflowStep.update({
      where: { id: currentStep.id },
      data: {
        status: 'INFO_REQUESTED',
        assignedTo: performedBy,
        remarks,
        data: data || {}
      }
    });

    // Notify customer
    await this.notifyAdditionalInfoRequired(applicationId, remarks, data?.requiredDocuments);
  }

  // Assign field agent
  private async assignFieldAgent(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    agentId: string,
    remarks?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Update application with assigned agent
      await tx.loanApplication.update({
        where: { applicationId },
        data: { fieldAgentId: agentId }
      });

      // Update workflow step
      await tx.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          assignedTo: agentId,
          remarks,
          data: { assignedBy: performedBy, assignedAt: new Date() }
        }
      });
    });

    // Notify field agent
    await this.notifyFieldAgentAssigned(applicationId, agentId);
  }

  // Auto-approve step
  private async autoApproveStep(applicationId: string, step: any): Promise<void> {
    const systemUserId = 'SYSTEM'; // System user for auto-approvals
    
    await this.approveStep(applicationId, step, systemUserId, 'Auto-approved by system');
  }

  // Verify step (for field verification)
  private async verifyStep(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    remarks?: string,
    data?: any
  ): Promise<void> {
    await prisma.workflowStep.update({
      where: { id: currentStep.id },
      data: {
        status: 'VERIFIED',
        assignedTo: performedBy,
        completedAt: new Date(),
        remarks,
        data: data || {}
      }
    });

    // Update application with verification details
    await prisma.loanApplication.update({
      where: { applicationId },
      data: {
        verificationDate: new Date(),
        verificationStatus: 'COMPLETED',
        verificationNotes: remarks,
        verificationPhotos: data?.photos || []
      }
    });

    // Auto-approve and move to next step
    await this.approveStep(applicationId, currentStep, performedBy, remarks, data);
  }

  // Disburse loan
  private async disburseLoan(
    applicationId: string, 
    currentStep: any, 
    performedBy: string, 
    remarks?: string,
    data?: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get application details
      const application = await tx.loanApplication.findUnique({
        where: { applicationId },
        include: { customer: true }
      });

      if (!application) {
        throw new Error('Application not found');
      }

      // Generate loan number
      const loanNumber = `GLN${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Create active loan
      const activeLoan = await tx.activeLoan.create({
        data: {
          applicationId,
          customerId: application.customerId,
          loanNumber,
          principalAmount: application.requestedAmount,
          interestRate: data?.interestRate || 12.0,
          loanTenureMonths: data?.tenureMonths || 12,
          loanStartDate: new Date(),
          loanEndDate: new Date(Date.now() + (data?.tenureMonths || 12) * 30 * 24 * 60 * 60 * 1000),
          loanStatus: LoanStatus.ACTIVE,
          outstandingPrincipal: application.requestedAmount,
          totalOutstanding: application.requestedAmount,
          pledgedGoldItems: application.goldItems as any,
          storageLocation: data?.storageLocation,
          insuranceDetails: (data?.insuranceDetails || {}) as any
        }
      });

      // Complete workflow step
      await tx.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'COMPLETED',
          assignedTo: performedBy,
          completedAt: new Date(),
          remarks,
          data: { loanId: activeLoan.loanId, ...data }
        }
      });

      // Update application
      await tx.loanApplication.update({
        where: { applicationId },
        data: {
          applicationStatus: ApplicationStatus.APPROVED
        }
      });
    });

    // Notify customer of disbursement
    await this.notifyLoanDisbursed(applicationId);
  }

  // Get workflow status
  async getWorkflowStatus(applicationId: string): Promise<any> {
    const steps = await prisma.workflowStep.findMany({
      where: { applicationId },
      orderBy: { stepOrder: 'asc' }
    });

    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: {
        customer: {
          select: { firstName: true, lastName: true, phoneNumber: true }
        },
        fieldAgent: {
          select: { firstName: true, lastName: true, phoneNumber: true }
        }
      }
    });

    return {
      application,
      steps,
      currentStep: steps.find(s => s.status === 'PENDING'),
      completedSteps: steps.filter(s => s.status === 'COMPLETED').length,
      totalSteps: steps.length,
      progressPercentage: Math.round((steps.filter(s => s.status === 'COMPLETED').length / steps.length) * 100)
    };
  }

  // Notification methods
  private async notifyNextStepReviewers(applicationId: string): Promise<void> {
    const notificationService = getNotificationService();
    
    const currentStep = await prisma.workflowStep.findFirst({
      where: {
        applicationId,
        status: 'PENDING'
      }
    });

    if (!currentStep) return;

    const stepDefinition = this.workflowSteps.find(s => s.stepId === currentStep.stepId);
    if (!stepDefinition) return;

    // Notify users with required roles
    await notificationService.sendToRole(stepDefinition.requiredRole, {
      type: 'verification_request',
      title: 'New Application Review Required',
      message: `Application requires ${stepDefinition.stepName}`,
      data: {
        applicationId,
        stepId: currentStep.stepId,
        stepName: currentStep.stepName
      },
      priority: 'high',
      actionRequired: true
    }, {
      websocket: true,
      email: true,
      push: true
    });
  }

  private async notifyApplicationApproved(applicationId: string): Promise<void> {
    const notificationService = getNotificationService();
    
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: { customer: true }
    });

    if (!application) return;

    await notificationService.sendToUser(application.customerId, {
      type: 'application_update',
      title: 'Loan Application Approved!',
      message: 'Congratulations! Your loan application has been approved and will be processed for disbursement.',
      data: {
        applicationId,
        applicationNumber: application.applicationNumber,
        requestedAmount: application.requestedAmount
      },
      priority: 'high',
      actionRequired: true
    }, {
      websocket: true,
      email: true,
      sms: true,
      whatsapp: true,
      push: true
    });
  }

  private async notifyApplicationRejected(applicationId: string, reason: string): Promise<void> {
    const notificationService = getNotificationService();
    
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: { customer: true }
    });

    if (!application) return;

    await notificationService.sendToUser(application.customerId, {
      type: 'application_update',
      title: 'Loan Application Update',
      message: `Your loan application has been rejected. Reason: ${reason}`,
      data: {
        applicationId,
        applicationNumber: application.applicationNumber,
        reason
      },
      priority: 'high'
    }, {
      websocket: true,
      email: true,
      sms: true,
      push: true
    });
  }

  private async notifyAdditionalInfoRequired(applicationId: string, message: string, requiredDocuments?: string[]): Promise<void> {
    const notificationService = getNotificationService();
    
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: { customer: true }
    });

    if (!application) return;

    await notificationService.sendToUser(application.customerId, {
      type: 'application_update',
      title: 'Additional Information Required',
      message: `Please provide additional information for your loan application: ${message}`,
      data: {
        applicationId,
        applicationNumber: application.applicationNumber,
        requiredDocuments: requiredDocuments || []
      },
      priority: 'medium',
      actionRequired: true
    }, {
      websocket: true,
      email: true,
      push: true
    });
  }

  private async notifyFieldAgentAssigned(applicationId: string, agentId: string): Promise<void> {
    const notificationService = getNotificationService();
    
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: { customer: true }
    });

    if (!application) return;

    await notificationService.sendToUser(agentId, {
      type: 'verification_request',
      title: 'Field Verification Assignment',
      message: `You have been assigned for field verification of loan application ${application.applicationNumber}`,
      data: {
        applicationId,
        applicationNumber: application.applicationNumber,
        customerName: `${application.customer.firstName} ${application.customer.lastName}`,
        customerPhone: application.customer.phoneNumber
      },
      priority: 'high',
      actionRequired: true
    }, {
      websocket: true,
      email: true,
      push: true
    });
  }

  private async notifyLoanDisbursed(applicationId: string): Promise<void> {
    const notificationService = getNotificationService();
    
    const application = await prisma.loanApplication.findUnique({
      where: { applicationId },
      include: { 
        customer: true,
        activeLoan: true
      }
    });

    if (!application?.activeLoan) return;

    await notificationService.sendToUser(application.customerId, {
      type: 'loan_status',
      title: 'Loan Disbursed Successfully',
      message: `Your loan of ₹${application.requestedAmount} has been disbursed. Loan Number: ${application.activeLoan.loanNumber}`,
      data: {
        applicationId,
        loanId: application.activeLoan.loanId,
        loanNumber: application.activeLoan.loanNumber,
        principalAmount: application.activeLoan.principalAmount
      },
      priority: 'high'
    }, {
      websocket: true,
      email: true,
      sms: true,
      whatsapp: true,
      push: true
    });
  }

  // Log workflow action
  private async logWorkflowAction(action: WorkflowAction, stepId: string): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: action.performedBy,
        tableName: 'workflow_steps',
        recordId: action.applicationId,
        action: 'UPDATE',
        newValues: {
          stepId,
          actionType: action.actionType,
          remarks: action.remarks,
          data: action.data
        }
      }
    });
  }

  // Get workflow metrics
  async getWorkflowMetrics(startDate?: Date, endDate?: Date): Promise<any> {
    const where: any = {};
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [
      totalApplications,
      completedWorkflows,
      averageProcessingTime,
      stepMetrics
    ] = await Promise.all([
      prisma.loanApplication.count({ where }),
      prisma.loanApplication.count({
        where: {
          ...where,
          applicationStatus: { in: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED] }
        }
      }),
      this.calculateAverageProcessingTime(where),
      this.getStepMetrics(where)
    ]);

    return {
      totalApplications,
      completedWorkflows,
      completionRate: totalApplications > 0 ? (completedWorkflows / totalApplications * 100) : 0,
      averageProcessingTime,
      stepMetrics
    };
  }

  private async calculateAverageProcessingTime(where: any): Promise<number> {
    const applications = await prisma.loanApplication.findMany({
      where: {
        ...where,
        submittedAt: { not: null },
        OR: [
          { approvedAt: { not: null } },
          { applicationStatus: ApplicationStatus.REJECTED }
        ]
      },
      select: {
        submittedAt: true,
        approvedAt: true,
        updatedAt: true,
        applicationStatus: true
      }
    });

    if (applications.length === 0) return 0;

    const totalHours = applications.reduce((sum, app) => {
      const endTime = app.approvedAt || app.updatedAt;
      if (app.submittedAt && endTime) {
        const hours = (endTime.getTime() - app.submittedAt.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);

    return Math.round(totalHours / applications.length);
  }

  private async getStepMetrics(where: any): Promise<any[]> {
    const stepStats = await prisma.workflowStep.groupBy({
      by: ['stepId', 'status'],
      _count: { id: true },
      where: {
        application: where
      }
    });

    return this.workflowSteps.map(step => {
      const stepData = stepStats.filter(s => s.stepId === step.stepId);
      const total = stepData.reduce((sum, s) => sum + s._count.id, 0);
      const completed = stepData.find(s => s.status === 'COMPLETED')?._count.id || 0;
      
      return {
        stepId: step.stepId,
        stepName: step.stepName,
        total,
        completed,
        completionRate: total > 0 ? (completed / total * 100) : 0
      };
    });
  }
}

export const loanWorkflowService = new LoanWorkflowService();