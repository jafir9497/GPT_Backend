import express from 'express';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest';
import { authenticateToken } from '../middleware/auth';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendTestNotification,
  getNotificationStats,
  sendBulkNotification,
  updateFCMToken
} from '../controllers/notificationController';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Update FCM token
router.post('/fcm-token',
  [
    body('fcmToken')
      .trim()
      .notEmpty()
      .withMessage('FCM token is required')
      .isLength({ min: 10 })
      .withMessage('FCM token must be at least 10 characters')
  ],
  validateRequest,
  updateFCMToken
);

// Get user notifications
router.get('/user',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('unreadOnly')
      .optional()
      .isBoolean()
      .withMessage('UnreadOnly must be boolean')
  ],
  validateRequest,
  getUserNotifications
);

// Mark notification as read
router.patch('/:notificationId/read',
  [
    param('notificationId')
      .trim()
      .notEmpty()
      .withMessage('Notification ID is required')
  ],
  validateRequest,
  markNotificationAsRead
);

// Mark all notifications as read
router.patch('/mark-all-read',
  markAllNotificationsAsRead
);

// Send test notification (admin only)
router.post('/test',
  [
    body('userId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('User ID cannot be empty'),
    body('type')
      .optional()
      .isIn(['loan_status', 'payment_received', 'application_update', 'system_alert', 'verification_request'])
      .withMessage('Invalid notification type'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('message')
      .optional()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority level')
  ],
  validateRequest,
  sendTestNotification
);

// Get notification statistics (admin only)
router.get('/stats',
  getNotificationStats
);

// Send bulk notification (admin only)
router.post('/bulk',
  [
    body('targetType')
      .isIn(['users', 'role', 'all'])
      .withMessage('Target type must be users, role, or all'),
    body('targetIds')
      .optional()
      .isArray()
      .withMessage('Target IDs must be an array'),
    body('targetRole')
      .optional()
      .isIn(['CUSTOMER', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'])
      .withMessage('Invalid target role'),
    body('type')
      .isIn(['loan_status', 'payment_received', 'application_update', 'system_alert', 'verification_request'])
      .withMessage('Invalid notification type'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('message')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority level'),
    body('actionRequired')
      .optional()
      .isBoolean()
      .withMessage('Action required must be boolean'),
    body('expiresInHours')
      .optional()
      .isInt({ min: 1, max: 8760 }) // max 1 year
      .withMessage('Expires in hours must be between 1 and 8760')
  ],
  validateRequest,
  sendBulkNotification
);

export default router;