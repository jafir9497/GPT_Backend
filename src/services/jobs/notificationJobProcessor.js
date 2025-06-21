const TwilioService = require('../twilioService');
const FirebaseService = require('../firebaseService');
const NotificationService = require('../notificationService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class NotificationJobProcessor {
  static async sendSMS(job) {
    const { phoneNumber, message, templateId } = job.data;
    
    try {
      console.log(`Processing SMS job: ${job.id} - Sending to ${phoneNumber}`);
      
      const twilioService = new TwilioService();
      const result = await twilioService.sendSMS(phoneNumber, message, templateId);

      // Log notification in database
      await prisma.notification.create({
        data: {
          userId: job.data.userId || null,
          type: 'SMS',
          title: 'SMS Notification',
          message: message,
          channel: 'SMS',
          status: 'SENT',
          sentAt: new Date(),
          metadata: {
            phoneNumber,
            templateId,
            twilioSid: result.sid
          }
        }
      });

      console.log(`SMS sent successfully to ${phoneNumber}, SID: ${result.sid}`);
      return { success: true, sid: result.sid, status: result.status };
    } catch (error) {
      console.error(`Failed to send SMS to ${phoneNumber}:`, error);
      
      // Log failed notification
      await prisma.notification.create({
        data: {
          userId: job.data.userId || null,
          type: 'SMS',
          title: 'SMS Notification',
          message: message,
          channel: 'SMS',
          status: 'FAILED',
          metadata: {
            phoneNumber,
            templateId,
            error: error.message
          }
        }
      });
      
      throw new Error(`SMS sending failed: ${error.message}`);
    }
  }

  static async sendPushNotification(job) {
    const { userId, title, body, data } = job.data;
    
    try {
      console.log(`Processing push notification job: ${job.id} - User ${userId}`);
      
      // Get user's FCM tokens
      const user = await prisma.user.findUnique({
        where: { userId },
        include: {
          customerDevices: {
            where: {
              isActive: true,
              fcmToken: { not: null }
            }
          }
        }
      });

      if (!user || user.customerDevices.length === 0) {
        throw new Error('No active devices found for user');
      }

      const firebaseService = new FirebaseService();
      const tokens = user.customerDevices.map(device => device.fcmToken);
      
      const result = await firebaseService.sendMulticastNotification(tokens, {
        title,
        body,
        data: {
          ...data,
          userId,
          timestamp: new Date().toISOString()
        }
      });

      // Log notification in database
      await prisma.notification.create({
        data: {
          userId: userId,
          type: 'PUSH',
          title: title,
          message: body,
          channel: 'PUSH',
          status: result.failureCount > 0 ? 'PARTIAL' : 'SENT',
          sentAt: new Date(),
          metadata: {
            successCount: result.successCount,
            failureCount: result.failureCount,
            tokens: tokens.length,
            data
          }
        }
      });

      console.log(`Push notification sent: ${result.successCount} successful, ${result.failureCount} failed`);
      return { 
        success: true, 
        successCount: result.successCount,
        failureCount: result.failureCount,
        responses: result.responses
      };
    } catch (error) {
      console.error(`Failed to send push notification to user ${userId}:`, error);
      
      // Log failed notification
      await prisma.notification.create({
        data: {
          userId: userId,
          type: 'PUSH',
          title: title,
          message: body,
          channel: 'PUSH',
          status: 'FAILED',
          metadata: {
            error: error.message,
            data
          }
        }
      });
      
      throw new Error(`Push notification sending failed: ${error.message}`);
    }
  }

  static async sendWhatsApp(job) {
    const { phoneNumber, message, mediaUrl } = job.data;
    
    try {
      console.log(`Processing WhatsApp job: ${job.id} - Sending to ${phoneNumber}`);
      
      const twilioService = new TwilioService();
      const result = await twilioService.sendWhatsApp(phoneNumber, message, mediaUrl);

      // Log notification in database
      await prisma.notification.create({
        data: {
          userId: job.data.userId || null,
          type: 'WHATSAPP',
          title: 'WhatsApp Message',
          message: message,
          channel: 'WHATSAPP',
          status: 'SENT',
          sentAt: new Date(),
          metadata: {
            phoneNumber,
            mediaUrl,
            twilioSid: result.sid
          }
        }
      });

      console.log(`WhatsApp message sent successfully to ${phoneNumber}, SID: ${result.sid}`);
      return { success: true, sid: result.sid, status: result.status };
    } catch (error) {
      console.error(`Failed to send WhatsApp message to ${phoneNumber}:`, error);
      
      // Log failed notification
      await prisma.notification.create({
        data: {
          userId: job.data.userId || null,
          type: 'WHATSAPP',
          title: 'WhatsApp Message',
          message: message,
          channel: 'WHATSAPP',
          status: 'FAILED',
          metadata: {
            phoneNumber,
            mediaUrl,
            error: error.message
          }
        }
      });
      
      throw new Error(`WhatsApp sending failed: ${error.message}`);
    }
  }

  static async sendBulkNotifications(job) {
    const { recipients, message, channels, batchSize = 100 } = job.data;
    
    try {
      console.log(`Processing bulk notification job: ${job.id} - ${recipients.length} recipients`);
      
      const results = {
        sms: { successful: 0, failed: 0, details: [] },
        push: { successful: 0, failed: 0, details: [] },
        whatsapp: { successful: 0, failed: 0, details: [] }
      };

      const total = recipients.length;
      let processed = 0;

      // Process in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (recipient) => {
          const recipientResults = {};
          
          // Send SMS if requested
          if (channels.includes('SMS') && recipient.phoneNumber) {
            try {
              const twilioService = new TwilioService();
              const smsResult = await twilioService.sendSMS(
                recipient.phoneNumber, 
                message.sms || message.default
              );
              recipientResults.sms = { success: true, sid: smsResult.sid };
              results.sms.successful++;
            } catch (error) {
              recipientResults.sms = { success: false, error: error.message };
              results.sms.failed++;
            }
          }

          // Send Push notification if requested
          if (channels.includes('PUSH') && recipient.userId) {
            try {
              // Get user's FCM tokens
              const user = await prisma.user.findUnique({
                where: { userId: recipient.userId },
                include: {
                  customerDevices: {
                    where: { isActive: true, fcmToken: { not: null } }
                  }
                }
              });

              if (user && user.customerDevices.length > 0) {
                const firebaseService = new FirebaseService();
                const tokens = user.customerDevices.map(device => device.fcmToken);
                
                const pushResult = await firebaseService.sendMulticastNotification(tokens, {
                  title: message.push?.title || message.title || 'Notification',
                  body: message.push?.body || message.default,
                  data: message.push?.data || {}
                });

                recipientResults.push = { 
                  success: pushResult.successCount > 0,
                  successCount: pushResult.successCount,
                  failureCount: pushResult.failureCount
                };
                
                if (pushResult.successCount > 0) results.push.successful++;
                if (pushResult.failureCount > 0) results.push.failed++;
              }
            } catch (error) {
              recipientResults.push = { success: false, error: error.message };
              results.push.failed++;
            }
          }

          // Send WhatsApp if requested
          if (channels.includes('WHATSAPP') && recipient.phoneNumber) {
            try {
              const twilioService = new TwilioService();
              const whatsappResult = await twilioService.sendWhatsApp(
                recipient.phoneNumber,
                message.whatsapp || message.default
              );
              recipientResults.whatsapp = { success: true, sid: whatsappResult.sid };
              results.whatsapp.successful++;
            } catch (error) {
              recipientResults.whatsapp = { success: false, error: error.message };
              results.whatsapp.failed++;
            }
          }

          return {
            recipient: recipient.userId || recipient.phoneNumber,
            results: recipientResults
          };
        });

        const batchResults = await Promise.allSettled(batchPromises);
        
        // Collect results
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const recipientResult = result.value;
            Object.keys(recipientResult.results).forEach(channel => {
              results[channel].details.push(recipientResult);
            });
          }
        });

        processed += batch.length;
        
        // Update job progress
        job.progress(Math.round((processed / total) * 100));
        
        // Small delay between batches
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`Bulk notifications completed:`, results);
      
      return {
        success: true,
        summary: {
          total,
          processed,
          results
        }
      };
    } catch (error) {
      console.error(`Bulk notification job failed:`, error);
      throw new Error(`Bulk notification sending failed: ${error.message}`);
    }
  }
}

module.exports = NotificationJobProcessor;