import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { DocumentStorageService, DocumentCategory, EntityType } from './documentStorageService';
import { COMPANY_BRANDING, getBrandingForDocument } from '../constants/branding';

export interface PDFTemplate {
  templateId: string;
  name: string;
  category: DocumentCategory;
  templatePath: string;
  requiredFields: string[];
  styling: PDFStyling;
}

export interface PDFStyling {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: {
    title: number;
    heading: number;
    body: number;
    small: number;
  };
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  headerHeight: number;
  footerHeight: number;
}

export interface PDFGenerationOptions {
  templateId: string;
  data: Record<string, any>;
  outputPath?: string;
  watermark?: string;
  metadata?: {
    title: string;
    author: string;
    subject: string;
    keywords: string[];
  };
  customStyling?: Partial<PDFStyling>;
}

export interface GeneratedPDFResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  documentId?: string;
  checksum: string;
}

export class PDFGenerationService {
  private documentStorageService: DocumentStorageService;
  private templatesPath: string;
  private outputPath: string;
  private defaultStyling: PDFStyling;

  constructor(
    documentStorageService: DocumentStorageService,
    templatesPath: string = './templates',
    outputPath: string = './documents/generated'
  ) {
    this.documentStorageService = documentStorageService;
    this.templatesPath = templatesPath;
    this.outputPath = outputPath;
    this.defaultStyling = this.getDefaultStyling();
  }

  private getDefaultStyling(): PDFStyling {
    return {
      primaryColor: COMPANY_BRANDING.colors.primary,
      secondaryColor: COMPANY_BRANDING.colors.secondary,
      fontFamily: 'Helvetica',
      fontSize: {
        title: 24,
        heading: 18,
        body: 12,
        small: 10,
      },
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50,
      },
      headerHeight: 80,
      footerHeight: 50,
    };
  }

  /**
   * Generate loan agreement PDF
   */
  async generateLoanAgreement(loanData: {
    loanId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    loanAmount: number;
    interestRate: number;
    tenure: number;
    goldWeight: number;
    goldPurity: number;
    goldValue: number;
    startDate: Date;
    maturityDate: Date;
    emiAmount: number;
    processingFee: number;
    terms: string[];
  }): Promise<GeneratedPDFResult> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: this.defaultStyling.margins,
    });

    const fileName = `loan_agreement_${loanData.loanId}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputPath, fileName);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Create write stream
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    this.addHeader(doc, 'GOLD LOAN AGREEMENT');

    // Agreement details
    let yPosition = 150;
    
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor);

    // Agreement number and date
    doc.text(`Agreement No: ${loanData.loanId}`, 50, yPosition);
    doc.text(`Date: ${loanData.startDate.toLocaleDateString('en-IN')}`, 350, yPosition);
    yPosition += 30;

    // Customer details section
    yPosition = this.addSection(doc, 'CUSTOMER DETAILS', yPosition);
    yPosition = this.addKeyValue(doc, 'Name', loanData.customerName, yPosition);
    yPosition = this.addKeyValue(doc, 'Phone', loanData.customerPhone, yPosition);
    yPosition = this.addKeyValue(doc, 'Address', loanData.customerAddress, yPosition);
    yPosition += 20;

    // Loan details section
    yPosition = this.addSection(doc, 'LOAN DETAILS', yPosition);
    yPosition = this.addKeyValue(doc, 'Loan Amount', `₹${loanData.loanAmount.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Interest Rate', `${loanData.interestRate}% per annum`, yPosition);
    yPosition = this.addKeyValue(doc, 'Tenure', `${loanData.tenure} months`, yPosition);
    yPosition = this.addKeyValue(doc, 'EMI Amount', `₹${loanData.emiAmount.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Processing Fee', `₹${loanData.processingFee.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Start Date', loanData.startDate.toLocaleDateString('en-IN'), yPosition);
    yPosition = this.addKeyValue(doc, 'Maturity Date', loanData.maturityDate.toLocaleDateString('en-IN'), yPosition);
    yPosition += 20;

    // Gold details section
    yPosition = this.addSection(doc, 'GOLD DETAILS', yPosition);
    yPosition = this.addKeyValue(doc, 'Weight', `${loanData.goldWeight} grams`, yPosition);
    yPosition = this.addKeyValue(doc, 'Purity', `${loanData.goldPurity} carat`, yPosition);
    yPosition = this.addKeyValue(doc, 'Appraised Value', `₹${loanData.goldValue.toLocaleString('en-IN')}`, yPosition);
    yPosition += 30;

    // Terms and conditions
    yPosition = this.addSection(doc, 'TERMS AND CONDITIONS', yPosition);
    loanData.terms.forEach((term, index) => {
      yPosition = this.addBulletPoint(doc, `${index + 1}. ${term}`, yPosition);
    });

    // Signature section
    yPosition += 40;
    this.addSignatureSection(doc, yPosition);

    // Footer
    this.addFooter(doc);

    doc.end();

    // Wait for file to be written
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    // Get file stats
    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const checksum = require('crypto').createHash('sha256').update(buffer).digest('hex');

    return {
      filePath,
      fileName,
      fileSize: stats.size,
      checksum,
    };
  }

  /**
   * Generate payment receipt PDF
   */
  async generatePaymentReceipt(paymentData: {
    receiptNumber: string;
    paymentId: string;
    loanId: string;
    customerName: string;
    paymentAmount: number;
    paymentDate: Date;
    paymentMethod: string;
    principalAmount: number;
    interestAmount: number;
    penaltyAmount: number;
    processingFeeAmount: number;
    remainingBalance: number;
    collectedBy?: string;
  }): Promise<GeneratedPDFResult> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: this.defaultStyling.margins,
    });

    const fileName = `payment_receipt_${paymentData.receiptNumber}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputPath, fileName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    this.addHeader(doc, 'PAYMENT RECEIPT');

    let yPosition = 150;

    // Receipt details
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor);

    doc.text(`Receipt No: ${paymentData.receiptNumber}`, 50, yPosition);
    doc.text(`Date: ${paymentData.paymentDate.toLocaleDateString('en-IN')}`, 350, yPosition);
    yPosition += 30;

    // Payment details
    yPosition = this.addSection(doc, 'PAYMENT DETAILS', yPosition);
    yPosition = this.addKeyValue(doc, 'Customer Name', paymentData.customerName, yPosition);
    yPosition = this.addKeyValue(doc, 'Loan ID', paymentData.loanId, yPosition);
    yPosition = this.addKeyValue(doc, 'Payment Method', paymentData.paymentMethod, yPosition);
    yPosition = this.addKeyValue(doc, 'Total Amount Paid', `₹${paymentData.paymentAmount.toLocaleString('en-IN')}`, yPosition);
    
    if (paymentData.collectedBy) {
      yPosition = this.addKeyValue(doc, 'Collected By', paymentData.collectedBy, yPosition);
    }
    yPosition += 20;

    // Payment breakdown
    yPosition = this.addSection(doc, 'PAYMENT BREAKDOWN', yPosition);
    yPosition = this.addKeyValue(doc, 'Principal Amount', `₹${paymentData.principalAmount.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Interest Amount', `₹${paymentData.interestAmount.toLocaleString('en-IN')}`, yPosition);
    
    if (paymentData.penaltyAmount > 0) {
      yPosition = this.addKeyValue(doc, 'Penalty Amount', `₹${paymentData.penaltyAmount.toLocaleString('en-IN')}`, yPosition);
    }
    
    if (paymentData.processingFeeAmount > 0) {
      yPosition = this.addKeyValue(doc, 'Processing Fee', `₹${paymentData.processingFeeAmount.toLocaleString('en-IN')}`, yPosition);
    }
    
    yPosition += 20;
    yPosition = this.addKeyValue(doc, 'Remaining Balance', `₹${paymentData.remainingBalance.toLocaleString('en-IN')}`, yPosition);

    // Thank you note
    yPosition += 40;
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.secondaryColor)
       .text('Thank you for your payment!', 50, yPosition, { align: 'center' });

    this.addFooter(doc);
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const checksum = require('crypto').createHash('sha256').update(buffer).digest('hex');

    return {
      filePath,
      fileName,
      fileSize: stats.size,
      checksum,
    };
  }

  /**
   * Generate loan statement PDF
   */
  async generateLoanStatement(statementData: {
    loanId: string;
    customerName: string;
    customerPhone: string;
    loanAmount: number;
    interestRate: number;
    startDate: Date;
    maturityDate: Date;
    currentBalance: number;
    totalPaid: number;
    paymentHistory: Array<{
      date: Date;
      amount: number;
      type: string;
      balance: number;
    }>;
    upcomingEMIs: Array<{
      dueDate: Date;
      amount: number;
      status: string;
    }>;
    statementPeriod: {
      from: Date;
      to: Date;
    };
  }): Promise<GeneratedPDFResult> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: this.defaultStyling.margins,
    });

    const fileName = `loan_statement_${statementData.loanId}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputPath, fileName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    this.addHeader(doc, 'LOAN STATEMENT');

    let yPosition = 150;

    // Statement period
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor);

    doc.text(
      `Statement Period: ${statementData.statementPeriod.from.toLocaleDateString('en-IN')} to ${statementData.statementPeriod.to.toLocaleDateString('en-IN')}`,
      50,
      yPosition,
      { align: 'center' }
    );
    yPosition += 40;

    // Account summary
    yPosition = this.addSection(doc, 'ACCOUNT SUMMARY', yPosition);
    yPosition = this.addKeyValue(doc, 'Customer Name', statementData.customerName, yPosition);
    yPosition = this.addKeyValue(doc, 'Loan ID', statementData.loanId, yPosition);
    yPosition = this.addKeyValue(doc, 'Original Loan Amount', `₹${statementData.loanAmount.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Current Balance', `₹${statementData.currentBalance.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Total Paid', `₹${statementData.totalPaid.toLocaleString('en-IN')}`, yPosition);
    yPosition += 30;

    // Payment history
    yPosition = this.addSection(doc, 'PAYMENT HISTORY', yPosition);
    yPosition = this.addTableHeader(doc, ['Date', 'Amount', 'Type', 'Balance'], yPosition);
    
    statementData.paymentHistory.forEach(payment => {
      yPosition = this.addTableRow(doc, [
        payment.date.toLocaleDateString('en-IN'),
        `₹${payment.amount.toLocaleString('en-IN')}`,
        payment.type,
        `₹${payment.balance.toLocaleString('en-IN')}`
      ], yPosition);
    });

    yPosition += 30;

    // Upcoming EMIs
    yPosition = this.addSection(doc, 'UPCOMING PAYMENTS', yPosition);
    yPosition = this.addTableHeader(doc, ['Due Date', 'Amount', 'Status'], yPosition);
    
    statementData.upcomingEMIs.forEach(emi => {
      yPosition = this.addTableRow(doc, [
        emi.dueDate.toLocaleDateString('en-IN'),
        `₹${emi.amount.toLocaleString('en-IN')}`,
        emi.status
      ], yPosition);
    });

    this.addFooter(doc);
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const checksum = require('crypto').createHash('sha256').update(buffer).digest('hex');

    return {
      filePath,
      fileName,
      fileSize: stats.size,
      checksum,
    };
  }

  /**
   * Generate business report PDF
   */
  async generateBusinessReport(reportData: {
    reportType: string;
    reportPeriod: {
      from: Date;
      to: Date;
    };
    totalLoans: number;
    totalAmount: number;
    totalCollections: number;
    activeLoans: number;
    overdueLoans: number;
    defaultLoans: number;
    profitLoss: {
      revenue: number;
      expenses: number;
      profit: number;
    };
    topPerformers: Array<{
      name: string;
      metric: string;
      value: number;
    }>;
    monthlyTrends: Array<{
      month: string;
      loans: number;
      collections: number;
    }>;
    generatedBy: string;
  }): Promise<GeneratedPDFResult> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: this.defaultStyling.margins,
    });

    const fileName = `business_report_${reportData.reportType}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputPath, fileName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    this.addHeader(doc, `${reportData.reportType.toUpperCase()} BUSINESS REPORT`);

    let yPosition = 150;

    // Report period
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor);

    doc.text(
      `Report Period: ${reportData.reportPeriod.from.toLocaleDateString('en-IN')} to ${reportData.reportPeriod.to.toLocaleDateString('en-IN')}`,
      50,
      yPosition,
      { align: 'center' }
    );
    yPosition += 40;

    // Key metrics
    yPosition = this.addSection(doc, 'KEY METRICS', yPosition);
    yPosition = this.addKeyValue(doc, 'Total Loans Disbursed', reportData.totalLoans.toString(), yPosition);
    yPosition = this.addKeyValue(doc, 'Total Amount Disbursed', `₹${reportData.totalAmount.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Total Collections', `₹${reportData.totalCollections.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Active Loans', reportData.activeLoans.toString(), yPosition);
    yPosition = this.addKeyValue(doc, 'Overdue Loans', reportData.overdueLoans.toString(), yPosition);
    yPosition = this.addKeyValue(doc, 'Default Loans', reportData.defaultLoans.toString(), yPosition);
    yPosition += 30;

    // Profit & Loss
    yPosition = this.addSection(doc, 'PROFIT & LOSS', yPosition);
    yPosition = this.addKeyValue(doc, 'Revenue', `₹${reportData.profitLoss.revenue.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Expenses', `₹${reportData.profitLoss.expenses.toLocaleString('en-IN')}`, yPosition);
    yPosition = this.addKeyValue(doc, 'Net Profit', `₹${reportData.profitLoss.profit.toLocaleString('en-IN')}`, yPosition);
    yPosition += 30;

    // Add new page if needed
    if (yPosition > 650) {
      doc.addPage();
      yPosition = 50;
    }

    // Top performers
    yPosition = this.addSection(doc, 'TOP PERFORMERS', yPosition);
    yPosition = this.addTableHeader(doc, ['Name', 'Metric', 'Value'], yPosition);
    
    reportData.topPerformers.forEach(performer => {
      yPosition = this.addTableRow(doc, [
        performer.name,
        performer.metric,
        performer.value.toString()
      ], yPosition);
    });

    yPosition += 30;

    // Monthly trends
    yPosition = this.addSection(doc, 'MONTHLY TRENDS', yPosition);
    yPosition = this.addTableHeader(doc, ['Month', 'Loans', 'Collections'], yPosition);
    
    reportData.monthlyTrends.forEach(trend => {
      yPosition = this.addTableRow(doc, [
        trend.month,
        trend.loans.toString(),
        `₹${trend.collections.toLocaleString('en-IN')}`
      ], yPosition);
    });

    // Generated by
    yPosition += 40;
    doc.fontSize(this.defaultStyling.fontSize.small)
       .fillColor('#666666')
       .text(`Generated by: ${reportData.generatedBy}`, 50, yPosition);

    this.addFooter(doc);
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const checksum = require('crypto').createHash('sha256').update(buffer).digest('hex');

    return {
      filePath,
      fileName,
      fileSize: stats.size,
      checksum,
    };
  }

  // Helper methods for PDF formatting

  private addHeader(doc: typeof PDFDocument, title: string): void {
    const branding = getBrandingForDocument();
    
    // Company logo placeholder - will be replaced with actual logo
    doc.rect(50, 30, 60, 40)
       .fillColor(COMPANY_BRANDING.colors.primary)
       .fill();
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .fillColor(COMPANY_BRANDING.colors.white)
       .text('GPT', 70, 45);

    // Company details
    doc.fontSize(this.defaultStyling.fontSize.heading)
       .fillColor(this.defaultStyling.primaryColor)
       .text(COMPANY_BRANDING.companyName, 120, 30);
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .fillColor('#666666')
       .text(COMPANY_BRANDING.tagline, 120, 46);
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text(COMPANY_BRANDING.address.line1, 120, 58);
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text(`${COMPANY_BRANDING.address.line2}, ${COMPANY_BRANDING.address.city}, ${COMPANY_BRANDING.address.state}, ${COMPANY_BRANDING.address.country}`, 120, 70);
    
    // Contact details on the right
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text(`Phone: ${COMPANY_BRANDING.contact.phone}`, 350, 58);
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text(`Email: ${COMPANY_BRANDING.contact.email}`, 350, 70);

    // Title
    doc.fontSize(this.defaultStyling.fontSize.title)
       .fillColor(this.defaultStyling.secondaryColor)
       .text(title, 50, 100, { align: 'center' });

    // Horizontal line
    doc.moveTo(50, 130)
       .lineTo(545, 130)
       .strokeColor(this.defaultStyling.primaryColor)
       .stroke();
  }

  private addFooter(doc: any): void {
    const footerY = 750;
    const branding = getBrandingForDocument();
    
    // Horizontal line
    doc.moveTo(50, footerY)
       .lineTo(545, footerY)
       .strokeColor(COMPANY_BRANDING.colors.primary)
       .stroke();

    // Company footer info
    doc.fontSize(this.defaultStyling.fontSize.small)
       .fillColor('#666666')
       .text(`${COMPANY_BRANDING.companyName} | ${COMPANY_BRANDING.contact.phone} | ${COMPANY_BRANDING.contact.email}`, 50, footerY + 10, { align: 'center' });

    // Footer disclaimer
    doc.fontSize(this.defaultStyling.fontSize.small)
       .fillColor('#666666')
       .text(COMPANY_BRANDING.templates.disclaimer, 50, footerY + 25, { align: 'center' });
    
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}`, 50, footerY + 40, { align: 'center' });
  }

  private addSection(doc: any, title: string, yPosition: number): number {
    doc.fontSize(this.defaultStyling.fontSize.heading)
       .fillColor(this.defaultStyling.secondaryColor)
       .text(title, 50, yPosition);
    
    return yPosition + 25;
  }

  private addKeyValue(doc: any, key: string, value: string, yPosition: number): number {
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor)
       .text(`${key}:`, 50, yPosition, { width: 150 });
    
    doc.text(value, 200, yPosition);
    
    return yPosition + 20;
  }

  private addBulletPoint(doc: any, text: string, yPosition: number): number {
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor)
       .text(text, 50, yPosition, { width: 495 });
    
    return yPosition + 15;
  }

  private addTableHeader(doc: any, headers: string[], yPosition: number): number {
    const colWidth = 495 / headers.length;
    
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.secondaryColor);
    
    headers.forEach((header, index) => {
      doc.text(header, 50 + (index * colWidth), yPosition, { width: colWidth });
    });
    
    // Underline
    doc.moveTo(50, yPosition + 15)
       .lineTo(545, yPosition + 15)
       .stroke();
    
    return yPosition + 25;
  }

  private addTableRow(doc: any, cells: string[], yPosition: number): number {
    const colWidth = 495 / cells.length;
    
    doc.fontSize(this.defaultStyling.fontSize.body)
       .fillColor(this.defaultStyling.primaryColor);
    
    cells.forEach((cell, index) => {
      doc.text(cell, 50 + (index * colWidth), yPosition, { width: colWidth });
    });
    
    return yPosition + 18;
  }

  private addSignatureSection(doc: any, yPosition: number): void {
    const signatureY = yPosition;
    
    // Customer signature
    doc.text('Customer Signature:', 50, signatureY);
    doc.moveTo(50, signatureY + 40)
       .lineTo(200, signatureY + 40)
       .stroke();
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text('Date: ___________', 50, signatureY + 50);

    // Lender signature
    doc.fontSize(this.defaultStyling.fontSize.body)
       .text('Authorized Signatory:', 350, signatureY);
    
    doc.moveTo(350, signatureY + 40)
       .lineTo(500, signatureY + 40)
       .stroke();
    
    doc.fontSize(this.defaultStyling.fontSize.small)
       .text('Date: ___________', 350, signatureY + 50);
  }

  /**
   * Store generated PDF in document storage system
   */
  async storePDF(
    pdfResult: GeneratedPDFResult,
    category: DocumentCategory,
    relatedEntityType: EntityType,
    relatedEntityId: string,
    uploadedBy: string
  ): Promise<string> {
    const buffer = await fs.readFile(pdfResult.filePath);
    
    const metadata = await this.documentStorageService.storeDocument(buffer, {
      fileName: pdfResult.fileName,
      originalName: pdfResult.fileName,
      mimeType: 'application/pdf',
      category,
      relatedEntityType,
      relatedEntityId,
      uploadedBy,
      accessPermissions: [],
    });

    // Delete temporary file
    await fs.unlink(pdfResult.filePath);

    return metadata.documentId;
  }
}