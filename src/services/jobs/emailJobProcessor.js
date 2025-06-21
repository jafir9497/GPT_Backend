const nodemailer = require('nodemailer');
const EmailService = require('../emailService');
const DocumentStorageService = require('../documentStorageService');
const PDFGenerationService = require('../pdfGenerationService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class EmailJobProcessor {
  static async sendEmail(job) {
    const { to, subject, content, template } = job.data;
    
    try {
      console.log(`Processing email job: ${job.id} - Sending email to ${to}`);
      
      const emailService = new EmailService();
      const result = await emailService.sendEmail({
        to,
        subject,
        html: content,
        template
      });

      console.log(`Email sent successfully to ${to}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  static async sendBulkEmail(job) {
    const { recipients, subject, content, template, batchSize = 50 } = job.data;
    
    try {
      console.log(`Processing bulk email job: ${job.id} - Sending to ${recipients.length} recipients`);
      
      const emailService = new EmailService();
      const results = [];
      const total = recipients.length;
      let processed = 0;

      // Process in batches to avoid overwhelming the email service
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const batchPromises = batch.map(async (recipient) => {
          try {
            const result = await emailService.sendEmail({
              to: recipient.email,
              subject: subject.replace(/\{name\}/g, recipient.name || 'Valued Customer'),
              html: content.replace(/\{name\}/g, recipient.name || 'Valued Customer'),
              template
            });
            return { success: true, email: recipient.email, messageId: result.messageId };
          } catch (error) {
            return { success: false, email: recipient.email, error: error.message };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults.map(r => r.value || r.reason));
        
        processed += batch.length;
        
        // Update job progress
        job.progress(Math.round((processed / total) * 100));
        
        // Small delay between batches
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`Bulk email completed: ${successful} successful, ${failed} failed`);
      
      return {
        success: true,
        summary: { total, successful, failed },
        results
      };
    } catch (error) {
      console.error(`Bulk email job failed:`, error);
      throw new Error(`Bulk email sending failed: ${error.message}`);
    }
  }

  static async sendReceiptEmail(job) {
    const { userId, paymentId, receiptData } = job.data;
    
    try {
      console.log(`Processing receipt email job: ${job.id} - Payment ${paymentId}`);
      
      // Get user details
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!user || !user.email) {
        throw new Error('User email not found');
      }

      // Generate receipt PDF
      const pdfService = new PDFGenerationService();
      const receiptPDF = await pdfService.generateReceipt(receiptData);
      
      // Save PDF to storage
      const storageService = new DocumentStorageService();
      const pdfPath = await storageService.saveDocument(
        receiptPDF,
        `receipt_${paymentId}.pdf`,
        'application/pdf',
        `customers/${userId}/receipts`
      );

      // Send email with receipt attachment
      const emailService = new EmailService();
      const result = await emailService.sendEmail({
        to: user.email,
        subject: `Payment Receipt - ${receiptData.receiptNumber}`,
        template: 'payment-receipt',
        templateData: {
          customerName: `${user.firstName} ${user.lastName}`,
          receiptNumber: receiptData.receiptNumber,
          paymentAmount: receiptData.paymentAmount,
          paymentDate: receiptData.paymentDate,
          loanNumber: receiptData.loanNumber
        },
        attachments: [{
          filename: `receipt_${paymentId}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }]
      });

      console.log(`Receipt email sent successfully for payment ${paymentId}`);
      return { success: true, messageId: result.messageId, pdfPath };
    } catch (error) {
      console.error(`Failed to send receipt email for payment ${paymentId}:`, error);
      throw new Error(`Receipt email sending failed: ${error.message}`);
    }
  }

  static async sendStatementEmail(job) {
    const { userId, loanId, statementData } = job.data;
    
    try {
      console.log(`Processing statement email job: ${job.id} - Loan ${loanId}`);
      
      // Get user details
      const user = await prisma.user.findUnique({
        where: { userId },
        select: { email: true, firstName: true, lastName: true }
      });

      if (!user || !user.email) {
        throw new Error('User email not found');
      }

      // Generate statement PDF
      const pdfService = new PDFGenerationService();
      const statementPDF = await pdfService.generateLoanStatement(statementData);
      
      // Save PDF to storage
      const storageService = new DocumentStorageService();
      const pdfPath = await storageService.saveDocument(
        statementPDF,
        `statement_${loanId}_${statementData.period}.pdf`,
        'application/pdf',
        `customers/${userId}/statements`
      );

      // Send email with statement attachment
      const emailService = new EmailService();
      const result = await emailService.sendEmail({
        to: user.email,
        subject: `Loan Statement - ${statementData.loanNumber} (${statementData.period})`,
        template: 'loan-statement',
        templateData: {
          customerName: `${user.firstName} ${user.lastName}`,
          loanNumber: statementData.loanNumber,
          period: statementData.period,
          outstandingAmount: statementData.outstandingAmount,
          nextDueDate: statementData.nextDueDate
        },
        attachments: [{
          filename: `statement_${loanId}_${statementData.period}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        }]
      });

      console.log(`Statement email sent successfully for loan ${loanId}`);
      return { success: true, messageId: result.messageId, pdfPath };
    } catch (error) {
      console.error(`Failed to send statement email for loan ${loanId}:`, error);
      throw new Error(`Statement email sending failed: ${error.message}`);
    }
  }
}

module.exports = EmailJobProcessor;