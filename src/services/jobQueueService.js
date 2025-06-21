const Queue = require('bull');
const Redis = require('ioredis');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const cron = require('node-cron');

// Import job processors
const EmailJobProcessor = require('./jobs/emailJobProcessor');
const DocumentJobProcessor = require('./jobs/documentJobProcessor');
const NotificationJobProcessor = require('./jobs/notificationJobProcessor');
const DataProcessingJobProcessor = require('./jobs/dataProcessingJobProcessor');
const AnalyticsJobProcessor = require('./jobs/analyticsJobProcessor');

class JobQueueService {
  constructor() {
    // Redis connection for Bull queues
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    // Initialize queues
    this.initializeQueues();
    
    // Setup Bull Board for monitoring
    this.setupBullBoard();
    
    // Setup cron jobs
    this.setupCronJobs();
    
    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  initializeQueues() {
    // Email processing queue
    this.emailQueue = new Queue('email processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // SMS/Push notification queue
    this.notificationQueue = new Queue('notification processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    // Document generation queue
    this.documentQueue = new Queue('document processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      },
    });

    // Data processing queue (exports, imports, cleanup)
    this.dataQueue = new Queue('data processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 25,
        removeOnFail: 10,
        attempts: 1,
        timeout: 600000, // 10 minutes
      },
    });

    // Analytics processing queue
    this.analyticsQueue = new Queue('analytics processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 10,
        attempts: 2,
        timeout: 300000, // 5 minutes
      },
    });

    // Setup job processors
    this.setupJobProcessors();
  }

  setupJobProcessors() {
    // Email queue processors
    this.emailQueue.process('send-email', 5, EmailJobProcessor.sendEmail);
    this.emailQueue.process('send-bulk-email', 2, EmailJobProcessor.sendBulkEmail);
    this.emailQueue.process('send-receipt-email', 10, EmailJobProcessor.sendReceiptEmail);
    this.emailQueue.process('send-statement-email', 3, EmailJobProcessor.sendStatementEmail);

    // Notification queue processors
    this.notificationQueue.process('send-sms', 10, NotificationJobProcessor.sendSMS);
    this.notificationQueue.process('send-push-notification', 15, NotificationJobProcessor.sendPushNotification);
    this.notificationQueue.process('send-whatsapp', 5, NotificationJobProcessor.sendWhatsApp);
    this.notificationQueue.process('send-bulk-notifications', 3, NotificationJobProcessor.sendBulkNotifications);

    // Document queue processors
    this.documentQueue.process('generate-pdf', 3, DocumentJobProcessor.generatePDF);
    this.documentQueue.process('generate-statement', 2, DocumentJobProcessor.generateStatement);
    this.documentQueue.process('generate-receipt', 5, DocumentJobProcessor.generateReceipt);
    this.documentQueue.process('bulk-document-generation', 1, DocumentJobProcessor.bulkDocumentGeneration);

    // Data processing queue processors
    this.dataQueue.process('export-data', 1, DataProcessingJobProcessor.exportData);
    this.dataQueue.process('import-data', 1, DataProcessingJobProcessor.importData);
    this.dataQueue.process('cleanup-old-data', 1, DataProcessingJobProcessor.cleanupOldData);
    this.dataQueue.process('backup-database', 1, DataProcessingJobProcessor.backupDatabase);

    // Analytics queue processors
    this.analyticsQueue.process('generate-analytics-report', 2, AnalyticsJobProcessor.generateAnalyticsReport);
    this.analyticsQueue.process('update-customer-scores', 1, AnalyticsJobProcessor.updateCustomerScores);
    this.analyticsQueue.process('calculate-risk-metrics', 1, AnalyticsJobProcessor.calculateRiskMetrics);
  }

  setupBullBoard() {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [
        new BullAdapter(this.emailQueue),
        new BullAdapter(this.notificationQueue),
        new BullAdapter(this.documentQueue),
        new BullAdapter(this.dataQueue),
        new BullAdapter(this.analyticsQueue),
      ],
      serverAdapter: serverAdapter,
    });

    this.bullBoardRouter = serverAdapter.getRouter();
  }

  setupCronJobs() {
    // Daily analytics update - runs at 2 AM
    cron.schedule('0 2 * * *', () => {
      console.log('Running daily analytics update...');
      this.addAnalyticsJob('generate-analytics-report', {
        type: 'daily',
        date: new Date().toISOString().split('T')[0]
      });
    });

    // Weekly customer score update - runs every Sunday at 3 AM
    cron.schedule('0 3 * * 0', () => {
      console.log('Running weekly customer score update...');
      this.addAnalyticsJob('update-customer-scores', {
        type: 'weekly',
        date: new Date().toISOString().split('T')[0]
      });
    });

    // Monthly risk metrics calculation - runs on 1st of every month at 4 AM
    cron.schedule('0 4 1 * *', () => {
      console.log('Running monthly risk metrics calculation...');
      this.addAnalyticsJob('calculate-risk-metrics', {
        type: 'monthly',
        date: new Date().toISOString().split('T')[0]
      });
    });

    // Daily data cleanup - runs at 1 AM
    cron.schedule('0 1 * * *', () => {
      console.log('Running daily data cleanup...');
      this.addDataJob('cleanup-old-data', {
        retentionDays: 365,
        tables: ['audit_logs', 'qr_authentication', 'notifications']
      });
    });

    // Weekly database backup - runs every Sunday at 12 AM
    cron.schedule('0 0 * * 0', () => {
      console.log('Running weekly database backup...');
      this.addDataJob('backup-database', {
        type: 'weekly',
        date: new Date().toISOString().split('T')[0]
      });
    });

    console.log('Cron jobs scheduled successfully');
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`Received ${signal}. Gracefully shutting down job queues...`);
      
      try {
        await Promise.all([
          this.emailQueue.close(),
          this.notificationQueue.close(),
          this.documentQueue.close(),
          this.dataQueue.close(),
          this.analyticsQueue.close(),
        ]);
        
        await this.redis.disconnect();
        console.log('Job queues shut down successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during job queue shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  // Email job methods
  addEmailJob(type, data, options = {}) {
    return this.emailQueue.add(type, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    });
  }

  async sendEmail(to, subject, content, template = null) {
    return this.addEmailJob('send-email', {
      to,
      subject,
      content,
      template,
      timestamp: new Date().toISOString()
    });
  }

  async sendReceiptEmail(userId, paymentId, receiptData) {
    return this.addEmailJob('send-receipt-email', {
      userId,
      paymentId,
      receiptData,
      timestamp: new Date().toISOString()
    }, { priority: 5 });
  }

  async sendStatementEmail(userId, loanId, statementData) {
    return this.addEmailJob('send-statement-email', {
      userId,
      loanId,
      statementData,
      timestamp: new Date().toISOString()
    }, { priority: 3 });
  }

  // Notification job methods
  addNotificationJob(type, data, options = {}) {
    return this.notificationQueue.add(type, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    });
  }

  async sendSMS(phoneNumber, message, templateId = null) {
    return this.addNotificationJob('send-sms', {
      phoneNumber,
      message,
      templateId,
      timestamp: new Date().toISOString()
    }, { priority: 7 });
  }

  async sendPushNotification(userId, title, body, data = {}) {
    return this.addNotificationJob('send-push-notification', {
      userId,
      title,
      body,
      data,
      timestamp: new Date().toISOString()
    }, { priority: 8 });
  }

  async sendWhatsApp(phoneNumber, message, mediaUrl = null) {
    return this.addNotificationJob('send-whatsapp', {
      phoneNumber,
      message,
      mediaUrl,
      timestamp: new Date().toISOString()
    }, { priority: 6 });
  }

  // Document job methods
  addDocumentJob(type, data, options = {}) {
    return this.documentQueue.add(type, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    });
  }

  async generatePDF(documentType, data, template) {
    return this.addDocumentJob('generate-pdf', {
      documentType,
      data,
      template,
      timestamp: new Date().toISOString()
    });
  }

  async generateReceipt(paymentId, paymentData) {
    return this.addDocumentJob('generate-receipt', {
      paymentId,
      paymentData,
      timestamp: new Date().toISOString()
    }, { priority: 8 });
  }

  async generateStatement(loanId, period, statementData) {
    return this.addDocumentJob('generate-statement', {
      loanId,
      period,
      statementData,
      timestamp: new Date().toISOString()
    }, { priority: 5 });
  }

  // Data processing job methods
  addDataJob(type, data, options = {}) {
    return this.dataQueue.add(type, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    });
  }

  async exportData(userId, exportType, filters = {}) {
    return this.addDataJob('export-data', {
      userId,
      exportType,
      filters,
      requestedAt: new Date().toISOString()
    });
  }

  async importData(userId, dataType, fileUrl, mappings = {}) {
    return this.addDataJob('import-data', {
      userId,
      dataType,
      fileUrl,
      mappings,
      requestedAt: new Date().toISOString()
    });
  }

  // Analytics job methods
  addAnalyticsJob(type, data, options = {}) {
    return this.analyticsQueue.add(type, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options
    });
  }

  async generateAnalyticsReport(reportType, parameters = {}) {
    return this.addAnalyticsJob('generate-analytics-report', {
      reportType,
      parameters,
      requestedAt: new Date().toISOString()
    });
  }

  // Queue monitoring methods
  async getQueueStats() {
    const [emailStats, notificationStats, documentStats, dataStats, analyticsStats] = await Promise.all([
      this.getQueueStat(this.emailQueue),
      this.getQueueStat(this.notificationQueue),
      this.getQueueStat(this.documentQueue),
      this.getQueueStat(this.dataQueue),
      this.getQueueStat(this.analyticsQueue),
    ]);

    return {
      email: emailStats,
      notification: notificationStats,
      document: documentStats,
      data: dataStats,
      analytics: analyticsStats,
      totalActive: emailStats.active + notificationStats.active + documentStats.active + dataStats.active + analyticsStats.active,
      totalWaiting: emailStats.waiting + notificationStats.waiting + documentStats.waiting + dataStats.waiting + analyticsStats.waiting,
    };
  }

  async getQueueStat(queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  // Pause/Resume queues
  async pauseQueue(queueName) {
    const queue = this[`${queueName}Queue`];
    if (queue) {
      await queue.pause();
      return true;
    }
    return false;
  }

  async resumeQueue(queueName) {
    const queue = this[`${queueName}Queue`];
    if (queue) {
      await queue.resume();
      return true;
    }
    return false;
  }

  // Clean up completed/failed jobs
  async cleanQueue(queueName, grace = 0, status = 'completed') {
    const queue = this[`${queueName}Queue`];
    if (queue) {
      await queue.clean(grace, status);
      return true;
    }
    return false;
  }

  getBullBoardRouter() {
    return this.bullBoardRouter;
  }
}

module.exports = JobQueueService;