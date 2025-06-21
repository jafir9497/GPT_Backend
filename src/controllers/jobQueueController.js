const JobQueueService = require('../services/jobQueueService');

class JobQueueController {
  constructor() {
    this.jobQueueService = new JobQueueService();
  }

  // Get queue statistics
  async getQueueStats(req, res) {
    try {
      const stats = await this.jobQueueService.getQueueStats();
      
      res.json({
        success: true,
        data: stats,
        message: 'Queue statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Queue stats error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve queue statistics',
          details: error.message
        }
      });
    }
  }

  // Pause a queue
  async pauseQueue(req, res) {
    try {
      const { queueName } = req.params;
      
      const result = await this.jobQueueService.pauseQueue(queueName);
      
      if (result) {
        res.json({
          success: true,
          message: `Queue ${queueName} paused successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          error: { message: `Queue ${queueName} not found` }
        });
      }
    } catch (error) {
      console.error('Pause queue error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to pause queue',
          details: error.message
        }
      });
    }
  }

  // Resume a queue
  async resumeQueue(req, res) {
    try {
      const { queueName } = req.params;
      
      const result = await this.jobQueueService.resumeQueue(queueName);
      
      if (result) {
        res.json({
          success: true,
          message: `Queue ${queueName} resumed successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          error: { message: `Queue ${queueName} not found` }
        });
      }
    } catch (error) {
      console.error('Resume queue error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to resume queue',
          details: error.message
        }
      });
    }
  }

  // Clean a queue
  async cleanQueue(req, res) {
    try {
      const { queueName } = req.params;
      const { grace = 0, status = 'completed' } = req.query;
      
      const result = await this.jobQueueService.cleanQueue(queueName, parseInt(grace), status);
      
      if (result) {
        res.json({
          success: true,
          message: `Queue ${queueName} cleaned successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          error: { message: `Queue ${queueName} not found` }
        });
      }
    } catch (error) {
      console.error('Clean queue error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to clean queue',
          details: error.message
        }
      });
    }
  }

  // Add email job
  async addEmailJob(req, res) {
    try {
      const { type, to, subject, content, template, priority = 0, delay = 0 } = req.body;
      
      if (!type || !to) {
        return res.status(400).json({
          success: false,
          error: { message: 'Type and recipient are required' }
        });
      }

      let job;
      
      switch (type) {
        case 'send-email':
          job = await this.jobQueueService.sendEmail(to, subject, content, template);
          break;
        case 'send-receipt-email':
          job = await this.jobQueueService.sendReceiptEmail(
            req.body.userId, 
            req.body.paymentId, 
            req.body.receiptData
          );
          break;
        case 'send-statement-email':
          job = await this.jobQueueService.sendStatementEmail(
            req.body.userId, 
            req.body.loanId, 
            req.body.statementData
          );
          break;
        default:
          return res.status(400).json({
            success: false,
            error: { message: `Unsupported email job type: ${type}` }
          });
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          type: type,
          status: 'queued'
        },
        message: 'Email job queued successfully'
      });
    } catch (error) {
      console.error('Add email job error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to queue email job',
          details: error.message
        }
      });
    }
  }

  // Add notification job
  async addNotificationJob(req, res) {
    try {
      const { type, phoneNumber, userId, message, title, body, data, priority = 0 } = req.body;
      
      if (!type) {
        return res.status(400).json({
          success: false,
          error: { message: 'Notification type is required' }
        });
      }

      let job;
      
      switch (type) {
        case 'send-sms':
          if (!phoneNumber || !message) {
            return res.status(400).json({
              success: false,
              error: { message: 'Phone number and message are required for SMS' }
            });
          }
          job = await this.jobQueueService.sendSMS(phoneNumber, message, req.body.templateId);
          break;
          
        case 'send-push-notification':
          if (!userId || !title || !body) {
            return res.status(400).json({
              success: false,
              error: { message: 'User ID, title, and body are required for push notification' }
            });
          }
          job = await this.jobQueueService.sendPushNotification(userId, title, body, data);
          break;
          
        case 'send-whatsapp':
          if (!phoneNumber || !message) {
            return res.status(400).json({
              success: false,
              error: { message: 'Phone number and message are required for WhatsApp' }
            });
          }
          job = await this.jobQueueService.sendWhatsApp(phoneNumber, message, req.body.mediaUrl);
          break;
          
        default:
          return res.status(400).json({
            success: false,
            error: { message: `Unsupported notification job type: ${type}` }
          });
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          type: type,
          status: 'queued'
        },
        message: 'Notification job queued successfully'
      });
    } catch (error) {
      console.error('Add notification job error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to queue notification job',
          details: error.message
        }
      });
    }
  }

  // Add document job
  async addDocumentJob(req, res) {
    try {
      const { type, documentType, data, template, priority = 0 } = req.body;
      
      if (!type || !data) {
        return res.status(400).json({
          success: false,
          error: { message: 'Type and data are required' }
        });
      }

      let job;
      
      switch (type) {
        case 'generate-pdf':
          job = await this.jobQueueService.generatePDF(documentType, data, template);
          break;
        case 'generate-receipt':
          job = await this.jobQueueService.generateReceipt(req.body.paymentId, data);
          break;
        case 'generate-statement':
          job = await this.jobQueueService.generateStatement(
            req.body.loanId, 
            req.body.period, 
            data
          );
          break;
        default:
          return res.status(400).json({
            success: false,
            error: { message: `Unsupported document job type: ${type}` }
          });
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          type: type,
          status: 'queued'
        },
        message: 'Document job queued successfully'
      });
    } catch (error) {
      console.error('Add document job error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to queue document job',
          details: error.message
        }
      });
    }
  }

  // Add data processing job
  async addDataJob(req, res) {
    try {
      const { type, userId, exportType, dataType, filters, fileUrl, mappings } = req.body;
      
      if (!type) {
        return res.status(400).json({
          success: false,
          error: { message: 'Job type is required' }
        });
      }

      let job;
      
      switch (type) {
        case 'export-data':
          if (!userId || !exportType) {
            return res.status(400).json({
              success: false,
              error: { message: 'User ID and export type are required' }
            });
          }
          job = await this.jobQueueService.exportData(userId, exportType, filters);
          break;
          
        case 'import-data':
          if (!userId || !dataType || !fileUrl) {
            return res.status(400).json({
              success: false,
              error: { message: 'User ID, data type, and file URL are required' }
            });
          }
          job = await this.jobQueueService.importData(userId, dataType, fileUrl, mappings);
          break;
          
        default:
          return res.status(400).json({
            success: false,
            error: { message: `Unsupported data job type: ${type}` }
          });
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          type: type,
          status: 'queued'
        },
        message: 'Data job queued successfully'
      });
    } catch (error) {
      console.error('Add data job error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to queue data job',
          details: error.message
        }
      });
    }
  }

  // Add analytics job
  async addAnalyticsJob(req, res) {
    try {
      const { type, reportType, parameters } = req.body;
      
      if (!type) {
        return res.status(400).json({
          success: false,
          error: { message: 'Job type is required' }
        });
      }

      let job;
      
      switch (type) {
        case 'generate-analytics-report':
          job = await this.jobQueueService.generateAnalyticsReport(reportType, parameters);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: { message: `Unsupported analytics job type: ${type}` }
          });
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          type: type,
          status: 'queued'
        },
        message: 'Analytics job queued successfully'
      });
    } catch (error) {
      console.error('Add analytics job error:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to queue analytics job',
          details: error.message
        }
      });
    }
  }

  // Get Bull Board router for monitoring
  getBullBoardRouter() {
    return this.jobQueueService.getBullBoardRouter();
  }
}

module.exports = new JobQueueController();