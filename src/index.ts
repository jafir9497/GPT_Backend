import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { initializeNotificationService } from './services/notificationService';
import { swaggerSpec } from './config/swagger';
import { cacheService } from './services/cacheService';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : true, // Allow all origins in development
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: express.Request) => {
    // Skip rate limiting for health checks and webhooks
    return req.path === '/health' || req.path.includes('/webhook');
  },
});

// Apply rate limiting to API routes
app.use('/api', limiter);

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '300000'), // 5 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5'), // 5 attempts per 5 minutes
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '300000') / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply stricter rate limiting to auth endpoints
app.use('/api/v1/auth/send-otp', authLimiter);
app.use('/api/v1/auth/verify-otp', authLimiter);
app.use('/api/v1/auth/login', authLimiter);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'GPT Gold Loan API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Health check endpoint
app.get('/health', async (req, res) => {
  const redisStatus = await cacheService.ping();
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      database: 'connected',
      redis: redisStatus ? 'connected' : 'disconnected',
      websocket: 'active',
      cache: cacheService.getConnectionStatus() ? 'active' : 'inactive'
    }
  });
});

// API metrics endpoint
app.get('/api/metrics', (req, res) => {
  res.status(200).json({
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    version: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Import routes
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import qrRoutes from './routes/qrRoutes';
import loanRoutes from './routes/loanRoutes';
import paymentRoutes, { webhookRouter } from './routes/paymentRoutes';
import documentRoutes from './routes/documentRoutes';
import adminRoutes from './routes/adminRoutes';
import notificationRoutes from './routes/notificationRoutes';
import biometricRoutes from './routes/biometricRoutes';
import workflowRoutes from './routes/workflowRoutes';
import kycRoutes from './routes/kycRoutes';
import goldCalculatorRoutes from './routes/goldCalculatorRoutes';

// Initialize WebSocket notification service with configuration
const notificationConfig = {
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || ''
    },
    from: process.env.EMAIL_FROM || 'noreply@goldloan.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Gold Loan Management'
  },
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || ''
  },
  whatsapp: {
    businessApiToken: process.env.WHATSAPP_BUSINESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || ''
  },
  pushNotification: {
    firebaseServerKey: process.env.FIREBASE_SERVER_KEY || '',
    vapidKeys: {
      publicKey: process.env.VAPID_PUBLIC_KEY || '',
      privateKey: process.env.VAPID_PRIVATE_KEY || ''
    }
  }
};

const notificationService = initializeNotificationService(httpServer, notificationConfig);

// Webhook routes (before body parsing middleware)
app.use('/api/v1/payments', webhookRouter);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/qr', qrRoutes);
app.use('/api/v1/loans', loanRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/biometric', biometricRoutes);
app.use('/api/v1/workflow', workflowRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/calculator', goldCalculatorRoutes);

// Default API route
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    message: 'GPT Gold Loan API v1',
    status: 'Running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      qr: '/api/v1/qr',
      loans: '/api/v1/loans',
      payments: '/api/v1/payments',
      documents: '/api/v1/documents',
      admin: '/api/v1/admin',
      notifications: '/api/v1/notifications',
      biometric: '/api/v1/biometric',
      workflow: '/api/v1/workflow',
      kyc: '/api/v1/kyc',
      calculator: '/api/v1/calculator',
      health: '/health',
      docs: '/api/docs',
      metrics: '/api/metrics'
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     error: 'Route not found',
//     message: `The requested route ${req.originalUrl} does not exist.`
//   });
// });

// Initialize cache service
async function initializeServices() {
  try {
    await cacheService.connect();
    logger.info('✅ Cache service connected');
  } catch (error) {
    logger.warn('⚠️ Cache service failed to connect, continuing without cache');
  }
}

// Start server
httpServer.listen(Number(PORT), HOST, async () => {
  logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
  logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  logger.info(`📊 API Metrics: http://localhost:${PORT}/api/metrics`);
  logger.info(`🔌 WebSocket server ready for real-time notifications`);
  
  // Initialize services
  await initializeServices();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await cacheService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await cacheService.disconnect();
  process.exit(0);
});

export default app;