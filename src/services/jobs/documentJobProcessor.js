const PDFGenerationService = require('../pdfGenerationService');
const DocumentStorageService = require('../documentStorageService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class DocumentJobProcessor {
  static async generatePDF(job) {
    const { documentType, data, template } = job.data;
    
    try {
      console.log(`Processing PDF generation job: ${job.id} - Type: ${documentType}`);
      
      const pdfService = new PDFGenerationService();
      let pdfBuffer;
      let filename;

      switch (documentType) {
        case 'receipt':
          pdfBuffer = await pdfService.generateReceipt(data);
          filename = `receipt_${data.paymentId || Date.now()}.pdf`;
          break;
        case 'statement':
          pdfBuffer = await pdfService.generateLoanStatement(data);
          filename = `statement_${data.loanId}_${data.period || Date.now()}.pdf`;
          break;
        case 'agreement':
          pdfBuffer = await pdfService.generateLoanAgreement(data);
          filename = `agreement_${data.loanId || Date.now()}.pdf`;
          break;
        case 'certificate':
          pdfBuffer = await pdfService.generateCertificate(data);
          filename = `certificate_${data.certificateType}_${Date.now()}.pdf`;
          break;
        default:
          throw new Error(`Unsupported document type: ${documentType}`);
      }

      // Save PDF to storage
      const storageService = new DocumentStorageService();
      const storagePath = `documents/${documentType}s/${data.customerId || 'system'}`;
      const filePath = await storageService.saveDocument(
        pdfBuffer,
        filename,
        'application/pdf',
        storagePath
      );

      // Save document record in database
      const documentRecord = await prisma.document.create({
        data: {
          customerId: data.customerId || null,
          loanId: data.loanId || null,
          documentType: documentType.toUpperCase(),
          documentCategory: data.category || documentType,
          title: data.title || `${documentType} Document`,
          fileName: filename,
          filePath: filePath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          generatedAt: new Date(),
          createdBy: data.createdBy || null,
          accessPermissions: data.accessPermissions || {},
          isActive: true
        }
      });

      console.log(`PDF generated successfully: ${filename}, Document ID: ${documentRecord.documentId}`);
      
      return {
        success: true,
        documentId: documentRecord.documentId,
        filename,
        filePath,
        fileSize: pdfBuffer.length
      };
    } catch (error) {
      console.error(`Failed to generate PDF for type ${documentType}:`, error);
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  static async generateReceipt(job) {
    const { paymentId, paymentData } = job.data;
    
    try {
      console.log(`Processing receipt generation job: ${job.id} - Payment: ${paymentId}`);
      
      // Get payment details from database
      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: {
          loan: {
            include: {
              customer: true,
              application: true
            }
          }
        }
      });

      if (!payment) {
        throw new Error(`Payment not found: ${paymentId}`);
      }

      const pdfService = new PDFGenerationService();
      const receiptData = {
        receiptNumber: payment.receiptNumber,
        paymentId: payment.paymentId,
        customerId: payment.loan.customerId,
        customerName: `${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
        loanNumber: payment.loan.loanNumber,
        paymentAmount: payment.paymentAmount,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        principalPayment: payment.principalPayment,
        interestPayment: payment.interestPayment,
        penaltyPayment: payment.penaltyPayment || 0,
        collectedBy: payment.collectedBy,
        ...paymentData
      };

      const pdfBuffer = await pdfService.generateReceipt(receiptData);
      const filename = `receipt_${payment.receiptNumber}.pdf`;

      // Save to storage
      const storageService = new DocumentStorageService();
      const filePath = await storageService.saveDocument(
        pdfBuffer,
        filename,
        'application/pdf',
        `customers/${payment.loan.customerId}/receipts`
      );

      // Update or create document record
      const documentRecord = await prisma.document.upsert({
        where: {
          // Composite unique constraint would be ideal here
          documentId: `receipt_${paymentId}`
        },
        update: {
          filePath,
          fileSize: pdfBuffer.length,
          generatedAt: new Date()
        },
        create: {
          customerId: payment.loan.customerId,
          loanId: payment.loanId,
          documentType: 'RECEIPT',
          documentCategory: 'payment_receipt',
          title: `Payment Receipt - ${payment.receiptNumber}`,
          fileName: filename,
          filePath: filePath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          generatedAt: new Date(),
          isActive: true
        }
      });

      console.log(`Receipt generated successfully for payment ${paymentId}`);
      
      return {
        success: true,
        documentId: documentRecord.documentId,
        receiptNumber: payment.receiptNumber,
        filename,
        filePath,
        fileSize: pdfBuffer.length
      };
    } catch (error) {
      console.error(`Failed to generate receipt for payment ${paymentId}:`, error);
      throw new Error(`Receipt generation failed: ${error.message}`);
    }
  }

  static async generateStatement(job) {
    const { loanId, period, statementData } = job.data;
    
    try {
      console.log(`Processing statement generation job: ${job.id} - Loan: ${loanId}, Period: ${period}`);
      
      // Get loan details from database
      const loan = await prisma.activeLoan.findUnique({
        where: { loanId },
        include: {
          customer: true,
          application: true,
          payments: {
            where: period ? {
              paymentDate: {
                gte: new Date(period.startDate),
                lte: new Date(period.endDate)
              }
            } : {},
            orderBy: { paymentDate: 'desc' }
          }
        }
      });

      if (!loan) {
        throw new Error(`Loan not found: ${loanId}`);
      }

      // Calculate statement data
      const totalPayments = loan.payments.reduce((sum, payment) => 
        sum + parseFloat(payment.paymentAmount), 0);
      const totalPrincipal = loan.payments.reduce((sum, payment) => 
        sum + parseFloat(payment.principalPayment || 0), 0);
      const totalInterest = loan.payments.reduce((sum, payment) => 
        sum + parseFloat(payment.interestPayment || 0), 0);

      const pdfService = new PDFGenerationService();
      const statementInfo = {
        loanId: loan.loanId,
        customerId: loan.customerId,
        customerName: `${loan.customer.firstName} ${loan.customer.lastName}`,
        loanNumber: loan.loanNumber,
        period: period || 'All Time',
        principalAmount: loan.principalAmount,
        interestRate: loan.interestRate,
        totalOutstanding: loan.totalOutstanding,
        nextDueDate: loan.nextDueDate,
        payments: loan.payments,
        summary: {
          totalPayments,
          totalPrincipal,
          totalInterest,
          paymentCount: loan.payments.length
        },
        ...statementData
      };

      const pdfBuffer = await pdfService.generateLoanStatement(statementInfo);
      const periodStr = period ? `${period.startDate}_${period.endDate}` : 'all_time';
      const filename = `statement_${loan.loanNumber}_${periodStr}.pdf`;

      // Save to storage
      const storageService = new DocumentStorageService();
      const filePath = await storageService.saveDocument(
        pdfBuffer,
        filename,
        'application/pdf',
        `customers/${loan.customerId}/statements`
      );

      // Create document record
      const documentRecord = await prisma.document.create({
        data: {
          customerId: loan.customerId,
          loanId: loan.loanId,
          documentType: 'STATEMENT',
          documentCategory: 'loan_statement',
          title: `Loan Statement - ${loan.loanNumber} (${period || 'All Time'})`,
          fileName: filename,
          filePath: filePath,
          fileSize: pdfBuffer.length,
          mimeType: 'application/pdf',
          generatedAt: new Date(),
          isActive: true
        }
      });

      console.log(`Statement generated successfully for loan ${loanId}`);
      
      return {
        success: true,
        documentId: documentRecord.documentId,
        loanNumber: loan.loanNumber,
        period: period || 'All Time',
        filename,
        filePath,
        fileSize: pdfBuffer.length
      };
    } catch (error) {
      console.error(`Failed to generate statement for loan ${loanId}:`, error);
      throw new Error(`Statement generation failed: ${error.message}`);
    }
  }

  static async bulkDocumentGeneration(job) {
    const { documentType, items, template } = job.data;
    
    try {
      console.log(`Processing bulk document generation job: ${job.id} - Type: ${documentType}, Count: ${items.length}`);
      
      const results = [];
      const total = items.length;
      let processed = 0;

      for (const item of items) {
        try {
          // Create individual job data
          const jobData = {
            documentType,
            data: item,
            template
          };

          // Generate document
          const result = await DocumentJobProcessor.generatePDF({ data: jobData });
          results.push({
            success: true,
            item: item.id || item.identifier,
            result
          });
        } catch (error) {
          results.push({
            success: false,
            item: item.id || item.identifier,
            error: error.message
          });
        }

        processed++;
        
        // Update job progress
        job.progress(Math.round((processed / total) * 100));
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`Bulk document generation completed: ${successful} successful, ${failed} failed`);
      
      return {
        success: true,
        summary: { total, successful, failed },
        results
      };
    } catch (error) {
      console.error(`Bulk document generation job failed:`, error);
      throw new Error(`Bulk document generation failed: ${error.message}`);
    }
  }
}

module.exports = DocumentJobProcessor;