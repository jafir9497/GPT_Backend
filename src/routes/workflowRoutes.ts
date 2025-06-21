import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getWorkflowStatus,
  processWorkflowAction,
  initializeWorkflow,
  getApplicationsWithWorkflow,
  getWorkflowMetrics,
  getMyWorkflowTasks
} from '../controllers/workflowController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get workflow status for specific application
router.get('/application/:applicationId/status', getWorkflowStatus);

// Initialize workflow for application
router.post('/application/:applicationId/initialize', initializeWorkflow);

// Process workflow action
router.post('/application/:applicationId/action', processWorkflowAction);

// Get applications with workflow status (admin/employee view)
router.get('/applications', getApplicationsWithWorkflow);

// Get workflow metrics (admin only)
router.get('/metrics', getWorkflowMetrics);

// Get my workflow tasks (employee view)
router.get('/my-tasks', getMyWorkflowTasks);

export default router;