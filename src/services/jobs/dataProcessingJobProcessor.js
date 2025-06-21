const fs = require('fs').promises;
const path = require('path');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const util = require('util');

const prisma = new PrismaClient();
const execAsync = util.promisify(exec);

class DataProcessingJobProcessor {
  static async exportData(job) {
    const { userId, exportType, filters } = job.data;
    
    try {
      console.log(`Processing data export job: ${job.id} - Type: ${exportType}, User: ${userId}`);
      
      let data;
      let filename;
      let headers;

      switch (exportType) {
        case 'loan_applications':
          data = await DataProcessingJobProcessor.exportLoanApplications(filters);
          filename = `loan_applications_${Date.now()}.csv`;
          headers = ['Application ID', 'Customer Name', 'Requested Amount', 'Status', 'Created Date'];
          break;
          
        case 'payments':
          data = await DataProcessingJobProcessor.exportPayments(filters);
          filename = `payments_${Date.now()}.csv`;
          headers = ['Payment ID', 'Loan Number', 'Customer Name', 'Amount', 'Date', 'Method'];
          break;
          
        case 'customers':
          data = await DataProcessingJobProcessor.exportCustomers(filters);
          filename = `customers_${Date.now()}.csv`;
          headers = ['Customer ID', 'Name', 'Phone', 'Email', 'Registration Date', 'Total Loans'];
          break;
          
        case 'active_loans':
          data = await DataProcessingJobProcessor.exportActiveLoans(filters);
          filename = `active_loans_${Date.now()}.csv`;
          headers = ['Loan ID', 'Loan Number', 'Customer Name', 'Principal', 'Outstanding', 'Status'];
          break;
          
        case 'analytics_report':
          return await DataProcessingJobProcessor.exportAnalyticsReport(filters, userId);
          
        default:
          throw new Error(`Unsupported export type: ${exportType}`);
      }

      // Generate CSV
      const parser = new Parser({ fields: headers });
      const csvData = parser.parse(data);

      // Save to file
      const exportDir = path.join(process.cwd(), 'exports');
      await fs.mkdir(exportDir, { recursive: true });
      const filePath = path.join(exportDir, filename);
      await fs.writeFile(filePath, csvData);

      // Create export record
      const exportRecord = await prisma.dataExport.create({
        data: {
          userId,
          exportType,
          fileName: filename,
          filePath: filePath,
          fileSize: csvData.length,
          recordCount: data.length,
          status: 'COMPLETED',
          filters: filters,
          completedAt: new Date()
        }
      });

      console.log(`Data export completed: ${filename}, Records: ${data.length}`);
      
      return {
        success: true,
        exportId: exportRecord.exportId,
        filename,
        filePath,
        recordCount: data.length,
        fileSize: csvData.length
      };
    } catch (error) {
      console.error(`Data export job failed for type ${exportType}:`, error);
      
      // Update export record with error
      await prisma.dataExport.create({
        data: {
          userId,
          exportType,
          status: 'FAILED',
          filters: filters,
          error: error.message
        }
      });
      
      throw new Error(`Data export failed: ${error.message}`);
    }
  }

  static async exportLoanApplications(filters = {}) {
    const whereClause = {};
    
    if (filters.startDate && filters.endDate) {
      whereClause.createdAt = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate)
      };
    }
    
    if (filters.status && filters.status !== 'ALL') {
      whereClause.applicationStatus = filters.status;
    }

    const applications = await prisma.loanApplication.findMany({
      where: whereClause,
      include: {
        customer: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return applications.map(app => ({
      'Application ID': app.applicationId,
      'Customer Name': `${app.customer.firstName} ${app.customer.lastName}`,
      'Requested Amount': parseFloat(app.requestedAmount),
      'Status': app.applicationStatus,
      'Created Date': app.createdAt.toISOString().split('T')[0]
    }));
  }

  static async exportPayments(filters = {}) {
    const whereClause = {};
    
    if (filters.startDate && filters.endDate) {
      whereClause.paymentDate = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate)
      };
    }
    
    if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
      whereClause.paymentMethod = filters.paymentMethod;
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        loan: {
          include: {
            customer: true
          }
        }
      },
      orderBy: { paymentDate: 'desc' }
    });

    return payments.map(payment => ({
      'Payment ID': payment.paymentId,
      'Loan Number': payment.loan.loanNumber,
      'Customer Name': `${payment.loan.customer.firstName} ${payment.loan.customer.lastName}`,
      'Amount': parseFloat(payment.paymentAmount),
      'Date': payment.paymentDate.toISOString().split('T')[0],
      'Method': payment.paymentMethod
    }));
  }

  static async exportCustomers(filters = {}) {
    const whereClause = { userType: 'CUSTOMER' };
    
    if (filters.startDate && filters.endDate) {
      whereClause.createdAt = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate)
      };
    }

    const customers = await prisma.user.findMany({
      where: whereClause,
      include: {
        activeLoans: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return customers.map(customer => ({
      'Customer ID': customer.userId,
      'Name': `${customer.firstName} ${customer.lastName}`,
      'Phone': customer.phoneNumber,
      'Email': customer.email || 'N/A',
      'Registration Date': customer.createdAt.toISOString().split('T')[0],
      'Total Loans': customer.activeLoans.length
    }));
  }

  static async exportActiveLoans(filters = {}) {
    const whereClause = {};
    
    if (filters.status && filters.status !== 'ALL') {
      whereClause.loanStatus = filters.status;
    }

    const loans = await prisma.activeLoan.findMany({
      where: whereClause,
      include: {
        customer: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return loans.map(loan => ({
      'Loan ID': loan.loanId,
      'Loan Number': loan.loanNumber,
      'Customer Name': `${loan.customer.firstName} ${loan.customer.lastName}`,
      'Principal': parseFloat(loan.principalAmount),
      'Outstanding': parseFloat(loan.totalOutstanding),
      'Status': loan.loanStatus
    }));
  }

  static async exportAnalyticsReport(filters, userId) {
    const workbook = new ExcelJS.Workbook();
    
    // Loan Analytics Sheet
    const loanSheet = workbook.addWorksheet('Loan Analytics');
    const loanData = await DataProcessingJobProcessor.exportActiveLoans(filters);
    
    loanSheet.columns = [
      { header: 'Loan ID', key: 'loanId', width: 15 },
      { header: 'Loan Number', key: 'loanNumber', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Principal Amount', key: 'principal', width: 15 },
      { header: 'Outstanding Amount', key: 'outstanding', width: 18 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    
    loanData.forEach(loan => {
      loanSheet.addRow({
        loanId: loan['Loan ID'],
        loanNumber: loan['Loan Number'],
        customerName: loan['Customer Name'],
        principal: loan['Principal'],
        outstanding: loan['Outstanding'],
        status: loan['Status']
      });
    });

    // Payment Analytics Sheet
    const paymentSheet = workbook.addWorksheet('Payment Analytics');
    const paymentData = await DataProcessingJobProcessor.exportPayments(filters);
    
    paymentSheet.columns = [
      { header: 'Payment ID', key: 'paymentId', width: 15 },
      { header: 'Loan Number', key: 'loanNumber', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Method', key: 'method', width: 12 }
    ];
    
    paymentData.forEach(payment => {
      paymentSheet.addRow({
        paymentId: payment['Payment ID'],
        loanNumber: payment['Loan Number'],
        customerName: payment['Customer Name'],
        amount: payment['Amount'],
        date: payment['Date'],
        method: payment['Method']
      });
    });

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    const summary = [
      { metric: 'Total Active Loans', value: loanData.length },
      { metric: 'Total Payments', value: paymentData.length },
      { metric: 'Total Principal Amount', value: loanData.reduce((sum, loan) => sum + loan['Principal'], 0) },
      { metric: 'Total Outstanding Amount', value: loanData.reduce((sum, loan) => sum + loan['Outstanding'], 0) },
      { metric: 'Export Generated Date', value: new Date().toISOString().split('T')[0] }
    ];

    summary.forEach(item => summarySheet.addRow(item));

    // Save file
    const filename = `analytics_report_${Date.now()}.xlsx`;
    const exportDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportDir, { recursive: true });
    const filePath = path.join(exportDir, filename);
    
    await workbook.xlsx.writeFile(filePath);
    const stats = await fs.stat(filePath);

    // Create export record
    const exportRecord = await prisma.dataExport.create({
      data: {
        userId,
        exportType: 'analytics_report',
        fileName: filename,
        filePath: filePath,
        fileSize: stats.size,
        recordCount: loanData.length + paymentData.length,
        status: 'COMPLETED',
        filters: filters,
        completedAt: new Date()
      }
    });

    return {
      success: true,
      exportId: exportRecord.exportId,
      filename,
      filePath,
      fileSize: stats.size,
      recordCount: loanData.length + paymentData.length
    };
  }

  static async importData(job) {
    const { userId, dataType, fileUrl, mappings } = job.data;
    
    try {
      console.log(`Processing data import job: ${job.id} - Type: ${dataType}, User: ${userId}`);
      
      // This is a placeholder for data import functionality
      // In a real implementation, you would:
      // 1. Download/read the file from fileUrl
      // 2. Parse the data (CSV, Excel, etc.)
      // 3. Validate the data against mappings
      // 4. Import data into appropriate tables
      // 5. Handle errors and duplicates
      
      const importRecord = await prisma.dataImport.create({
        data: {
          userId,
          dataType,
          fileName: path.basename(fileUrl),
          fileUrl,
          status: 'PROCESSING',
          mappings: mappings,
          startedAt: new Date()
        }
      });

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Update import record
      await prisma.dataImport.update({
        where: { importId: importRecord.importId },
        data: {
          status: 'COMPLETED',
          recordsProcessed: 0, // Would be actual count
          recordsImported: 0,  // Would be actual count
          recordsFailed: 0,    // Would be actual count
          completedAt: new Date()
        }
      });

      console.log(`Data import completed for type ${dataType}`);
      
      return {
        success: true,
        importId: importRecord.importId,
        recordsProcessed: 0,
        recordsImported: 0,
        recordsFailed: 0
      };
    } catch (error) {
      console.error(`Data import job failed for type ${dataType}:`, error);
      throw new Error(`Data import failed: ${error.message}`);
    }
  }

  static async cleanupOldData(job) {
    const { retentionDays, tables } = job.data;
    
    try {
      console.log(`Processing data cleanup job: ${job.id} - Retention: ${retentionDays} days`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const results = {};

      for (const table of tables) {
        try {
          let deletedCount = 0;

          switch (table) {
            case 'audit_logs':
              const auditResult = await prisma.auditLog.deleteMany({
                where: {
                  createdAt: { lt: cutoffDate }
                }
              });
              deletedCount = auditResult.count;
              break;

            case 'qr_authentication':
              const qrResult = await prisma.qRAuthentication.deleteMany({
                where: {
                  createdAt: { lt: cutoffDate },
                  sessionStatus: { in: ['USED', 'EXPIRED'] }
                }
              });
              deletedCount = qrResult.count;
              break;

            case 'notifications':
              const notificationResult = await prisma.notification.deleteMany({
                where: {
                  createdAt: { lt: cutoffDate },
                  status: { in: ['SENT', 'FAILED'] }
                }
              });
              deletedCount = notificationResult.count;
              break;

            default:
              console.warn(`Cleanup not implemented for table: ${table}`);
          }

          results[table] = { deletedCount, success: true };
          console.log(`Cleaned up ${deletedCount} records from ${table}`);
        } catch (error) {
          results[table] = { deletedCount: 0, success: false, error: error.message };
          console.error(`Failed to cleanup table ${table}:`, error);
        }
      }

      const totalDeleted = Object.values(results).reduce((sum, result) => 
        sum + (result.deletedCount || 0), 0);

      console.log(`Data cleanup completed: ${totalDeleted} total records deleted`);
      
      return {
        success: true,
        cutoffDate: cutoffDate.toISOString(),
        totalDeleted,
        results
      };
    } catch (error) {
      console.error(`Data cleanup job failed:`, error);
      throw new Error(`Data cleanup failed: ${error.message}`);
    }
  }

  static async backupDatabase(job) {
    const { type, date } = job.data;
    
    try {
      console.log(`Processing database backup job: ${job.id} - Type: ${type}`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(process.cwd(), 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      
      const filename = `backup_${type}_${timestamp}.sql`;
      const filePath = path.join(backupDir, filename);

      // Using pg_dump for PostgreSQL backup
      const dbUrl = process.env.DATABASE_URL;
      const command = `pg_dump "${dbUrl}" > "${filePath}"`;
      
      console.log('Starting database backup...');
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        console.warn('Backup warnings:', stderr);
      }

      // Check if backup file was created and has content
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      // Create backup record
      const backupRecord = await prisma.databaseBackup.create({
        data: {
          backupType: type.toUpperCase(),
          fileName: filename,
          filePath: filePath,
          fileSize: stats.size,
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Cleanup old backups (keep last 7 for weekly, last 30 for daily)
      const retentionCount = type === 'weekly' ? 7 : 30;
      const oldBackups = await prisma.databaseBackup.findMany({
        where: { backupType: type.toUpperCase() },
        orderBy: { createdAt: 'desc' },
        skip: retentionCount
      });

      for (const oldBackup of oldBackups) {
        try {
          await fs.unlink(oldBackup.filePath);
          await prisma.databaseBackup.delete({
            where: { backupId: oldBackup.backupId }
          });
        } catch (error) {
          console.warn(`Failed to cleanup old backup ${oldBackup.fileName}:`, error);
        }
      }

      console.log(`Database backup completed: ${filename}, Size: ${Math.round(stats.size / 1024 / 1024)}MB`);
      
      return {
        success: true,
        backupId: backupRecord.backupId,
        filename,
        filePath,
        fileSize: stats.size,
        sizeInMB: Math.round(stats.size / 1024 / 1024)
      };
    } catch (error) {
      console.error(`Database backup job failed:`, error);
      
      // Create failed backup record
      await prisma.databaseBackup.create({
        data: {
          backupType: type.toUpperCase(),
          status: 'FAILED',
          error: error.message
        }
      });
      
      throw new Error(`Database backup failed: ${error.message}`);
    }
  }
}

module.exports = DataProcessingJobProcessor;