const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class NotificationTemplateService {
  constructor() {
    this.templatesPath = path.join(process.cwd(), 'templates');
    this.compiledTemplates = new Map();
    this.initializeTemplates();
  }

  async initializeTemplates() {
    try {
      // Ensure templates directory exists
      await fs.mkdir(this.templatesPath, { recursive: true });
      await fs.mkdir(path.join(this.templatesPath, 'email'), { recursive: true });
      await fs.mkdir(path.join(this.templatesPath, 'sms'), { recursive: true });
      await fs.mkdir(path.join(this.templatesPath, 'push'), { recursive: true });
      await fs.mkdir(path.join(this.templatesPath, 'whatsapp'), { recursive: true });

      // Register Handlebars helpers
      this.registerHandlebarsHelpers();

      // Load default templates
      await this.loadDefaultTemplates();

      console.log('Notification template service initialized');
    } catch (error) {
      console.error('Failed to initialize notification templates:', error);
    }
  }

  registerHandlebarsHelpers() {
    // Currency formatting helper
    Handlebars.registerHelper('currency', function(amount) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
    });

    // Date formatting helper
    Handlebars.registerHelper('date', function(date, format = 'short') {
      const dateObj = new Date(date);
      if (format === 'short') {
        return dateObj.toLocaleDateString('en-IN');
      } else if (format === 'long') {
        return dateObj.toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } else if (format === 'time') {
        return dateObj.toLocaleTimeString('en-IN');
      }
      return dateObj.toLocaleDateString('en-IN');
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // String capitalization helper
    Handlebars.registerHelper('capitalize', function(str) {
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });

    // Phone number formatting helper
    Handlebars.registerHelper('formatPhone', function(phone) {
      if (phone.startsWith('+91')) {
        return phone;
      }
      return '+91' + phone.replace(/^\+?91?/, '');
    });

    // Loan status helper
    Handlebars.registerHelper('loanStatus', function(status) {
      const statusMap = {
        'ACTIVE': 'Active',
        'COMPLETED': 'Completed',
        'DEFAULTED': 'Defaulted',
        'CLOSED': 'Closed'
      };
      return statusMap[status] || status;
    });
  }

  async loadDefaultTemplates() {
    const defaultTemplates = [
      // Email Templates
      {
        type: 'EMAIL',
        name: 'welcome_email',
        subject: 'Welcome to GPT Gold Loan - {{customerName}}',
        content: await this.getDefaultEmailTemplate('welcome'),
        variables: ['customerName', 'phoneNumber', 'registrationDate']
      },
      {
        type: 'EMAIL',
        name: 'loan_application_received',
        subject: 'Loan Application Received - {{applicationNumber}}',
        content: await this.getDefaultEmailTemplate('loan_application_received'),
        variables: ['customerName', 'applicationNumber', 'requestedAmount', 'submittedDate']
      },
      {
        type: 'EMAIL',
        name: 'loan_approved',
        subject: 'Loan Approved - {{loanNumber}}',
        content: await this.getDefaultEmailTemplate('loan_approved'),
        variables: ['customerName', 'loanNumber', 'approvedAmount', 'interestRate', 'tenure']
      },
      {
        type: 'EMAIL',
        name: 'payment_receipt',
        subject: 'Payment Receipt - {{receiptNumber}}',
        content: await this.getDefaultEmailTemplate('payment_receipt'),
        variables: ['customerName', 'receiptNumber', 'paymentAmount', 'paymentDate', 'loanNumber']
      },
      {
        type: 'EMAIL',
        name: 'loan_statement',
        subject: 'Loan Statement - {{loanNumber}} ({{period}})',
        content: await this.getDefaultEmailTemplate('loan_statement'),
        variables: ['customerName', 'loanNumber', 'period', 'outstandingAmount', 'nextDueDate']
      },

      // SMS Templates
      {
        type: 'SMS',
        name: 'otp_verification',
        subject: null,
        content: 'Your GPT Gold Loan OTP is {{otp}}. Valid for 5 minutes. Do not share with anyone.',
        variables: ['otp']
      },
      {
        type: 'SMS',
        name: 'loan_application_received',
        subject: null,
        content: 'Dear {{customerName}}, your loan application {{applicationNumber}} has been received. We will contact you within 24 hours.',
        variables: ['customerName', 'applicationNumber']
      },
      {
        type: 'SMS',
        name: 'payment_reminder',
        subject: null,
        content: 'Dear {{customerName}}, your EMI of {{currency emiAmount}} for loan {{loanNumber}} is due on {{date dueDate}}. Pay now to avoid late charges.',
        variables: ['customerName', 'emiAmount', 'loanNumber', 'dueDate']
      },
      {
        type: 'SMS',
        name: 'payment_received',
        subject: null,
        content: 'Payment of {{currency paymentAmount}} received for loan {{loanNumber}}. Receipt: {{receiptNumber}}. Thank you!',
        variables: ['paymentAmount', 'loanNumber', 'receiptNumber']
      },

      // Push Notification Templates
      {
        type: 'PUSH',
        name: 'loan_status_update',
        subject: 'Loan Status Updated',
        content: 'Your loan application {{applicationNumber}} status has been updated to {{status}}.',
        variables: ['applicationNumber', 'status']
      },
      {
        type: 'PUSH',
        name: 'payment_due_reminder',
        subject: 'Payment Due Reminder',
        content: 'Your EMI of {{currency emiAmount}} is due tomorrow. Tap to pay now.',
        variables: ['emiAmount']
      },
      {
        type: 'PUSH',
        name: 'field_agent_visit',
        subject: 'Field Agent Visit Scheduled',
        content: 'Our agent will visit you on {{date visitDate}} at {{time visitTime}} for loan verification.',
        variables: ['visitDate', 'visitTime']
      },

      // WhatsApp Templates
      {
        type: 'WHATSAPP',
        name: 'welcome_message',
        subject: null,
        content: `🙏 Welcome to GPT Gold Loan, {{customerName}}!

Thank you for registering with us. Your account is now active.

📱 Phone: {{formatPhone phoneNumber}}
📅 Registered: {{date registrationDate}}

🏠 *Doorstep Gold Loan Service*
📍 Anna Nagar, Chennai
📞 +91 73393 37747

Need help? Reply with "HELP" or call our support team.

Best regards,
GPT Gold Loan Team`,
        variables: ['customerName', 'phoneNumber', 'registrationDate']
      },
      {
        type: 'WHATSAPP',
        name: 'loan_approved_rich',
        subject: null,
        content: `🎉 Congratulations {{customerName}}!

Your gold loan has been approved:

💰 Loan Amount: {{currency approvedAmount}}
📊 Interest Rate: {{interestRate}}% per annum
⏰ Tenure: {{tenure}} months
🔢 Loan Number: {{loanNumber}}

Your funds will be disbursed within 24 hours.

Click here to track your loan: {{loanTrackingUrl}}`,
        variables: ['customerName', 'approvedAmount', 'interestRate', 'tenure', 'loanNumber', 'loanTrackingUrl']
      }
    ];

    for (const template of defaultTemplates) {
      await this.saveTemplate(template);
    }
  }

  async getDefaultEmailTemplate(templateName) {
    const templates = {
      welcome: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Welcome to GPT Gold Loan</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #F21905, #F23827); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { background: #730C02; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .button { background: #F21905; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to GPT Gold Loan</h1>
        </div>
        <div class="content">
            <h2>Welcome {{customerName}}!</h2>
            <p>Thank you for registering with GPT Gold Loan. We're excited to have you as part of our family.</p>
            
            <h3>Your Account Details:</h3>
            <ul>
                <li><strong>Phone Number:</strong> {{formatPhone phoneNumber}}</li>
                <li><strong>Registration Date:</strong> {{date registrationDate 'long'}}</li>
            </ul>
            
            <p>With GPT Gold Loan, you can:</p>
            <ul>
                <li>✅ Apply for gold loans instantly</li>
                <li>✅ Get doorstep service</li>
                <li>✅ Track your applications in real-time</li>
                <li>✅ Make payments easily</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="#" class="button">Start Your Loan Application</a>
            </div>
            
            <p>If you have any questions, feel free to contact our support team.</p>
        </div>
        <div class="footer">
            <p><strong>GPT Gold Loan</strong> - Doorstep Gold Loan Service</p>
            <p>No 6, Y Block, Sivananth Building (Basement), Anna Nagar, Chennai, Tamil Nadu, India</p>
            <p>Phone: +91 73393 37747 | Email: gptjewellerygoldloan@gmail.com</p>
            <p>&copy; 2024 GPT Gold Loan. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>`,

      loan_application_received: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Loan Application Received</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #F21905, #F23827); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .status-box { background: #e8f5e8; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table th, .details-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .details-table th { background: #f5f5f5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Loan Application Received</h1>
        </div>
        <div class="content">
            <h2>Dear {{customerName}},</h2>
            
            <div class="status-box">
                <strong>✅ Your loan application has been successfully received!</strong>
            </div>
            
            <p>We have received your gold loan application and our team is now reviewing it.</p>
            
            <table class="details-table">
                <tr>
                    <th>Application Number</th>
                    <td>{{applicationNumber}}</td>
                </tr>
                <tr>
                    <th>Requested Amount</th>
                    <td>{{currency requestedAmount}}</td>
                </tr>
                <tr>
                    <th>Submitted Date</th>
                    <td>{{date submittedDate 'long'}}</td>
                </tr>
            </table>
            
            <h3>What happens next?</h3>
            <ol>
                <li>Our team will review your application within 2-4 hours</li>
                <li>We'll assign a field agent for gold verification</li>
                <li>You'll receive a call to schedule the doorstep visit</li>
                <li>After verification, your loan will be processed</li>
            </ol>
            
            <p>You can track your application status anytime in the app.</p>
        </div>
    </div>
</body>
</html>`,

      loan_approved: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Loan Approved</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .approval-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
        .loan-details { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Loan Approved!</h1>
        </div>
        <div class="content">
            <div class="approval-box">
                <h2>Congratulations {{customerName}}!</h2>
                <p>Your gold loan application has been approved.</p>
            </div>
            
            <div class="loan-details">
                <h3>Loan Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Loan Number:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{loanNumber}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Approved Amount:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{currency approvedAmount}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Interest Rate:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{interestRate}}% per annum</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;"><strong>Tenure:</strong></td>
                        <td style="padding: 10px;">{{tenure}} months</td>
                    </tr>
                </table>
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
                <li>Your loan amount will be disbursed within 24 hours</li>
                <li>You'll receive a disbursement confirmation</li>
                <li>Your EMI schedule will be available in the app</li>
            </ul>
        </div>
    </div>
</body>
</html>`,

      payment_receipt: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payment Receipt</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #F21905; color: white; padding: 20px; text-align: center; }
        .receipt { background: white; border: 2px solid #F21905; margin: 20px 0; }
        .receipt-header { background: #f8f9fa; padding: 15px; border-bottom: 1px solid #dee2e6; }
        .receipt-body { padding: 20px; }
        .receipt-table { width: 100%; border-collapse: collapse; }
        .receipt-table td { padding: 8px; border-bottom: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Payment Receipt</h1>
        </div>
        
        <div class="receipt">
            <div class="receipt-header">
                <h3 style="margin: 0;">GPT Gold Loan - Payment Receipt</h3>
                <p style="margin: 5px 0;">Receipt #{{receiptNumber}}</p>
            </div>
            
            <div class="receipt-body">
                <table class="receipt-table">
                    <tr>
                        <td><strong>Customer Name:</strong></td>
                        <td>{{customerName}}</td>
                    </tr>
                    <tr>
                        <td><strong>Loan Number:</strong></td>
                        <td>{{loanNumber}}</td>
                    </tr>
                    <tr>
                        <td><strong>Payment Amount:</strong></td>
                        <td><strong>{{currency paymentAmount}}</strong></td>
                    </tr>
                    <tr>
                        <td><strong>Payment Date:</strong></td>
                        <td>{{date paymentDate 'long'}}</td>
                    </tr>
                    <tr>
                        <td><strong>Receipt Number:</strong></td>
                        <td>{{receiptNumber}}</td>
                    </tr>
                </table>
                
                <div style="text-align: center; margin-top: 30px; padding: 20px; background: #e8f5e8;">
                    <h3 style="color: #28a745; margin: 0;">Payment Successful ✅</h3>
                    <p style="margin: 10px 0;">Thank you for your payment!</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`,

      loan_statement: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Loan Statement</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #F21905; color: white; padding: 20px; text-align: center; }
        .statement { background: white; border: 1px solid #ddd; margin: 20px 0; }
        .statement-header { background: #f8f9fa; padding: 15px; }
        .statement-body { padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Loan Statement</h1>
        </div>
        
        <div class="statement">
            <div class="statement-header">
                <h3>Loan Statement - {{period}}</h3>
                <p>Loan Number: {{loanNumber}}</p>
            </div>
            
            <div class="statement-body">
                <p>Dear {{customerName}},</p>
                <p>Please find your loan statement for the period {{period}} attached with this email.</p>
                
                <div style="background: #f8f9fa; padding: 15px; margin: 20px 0;">
                    <h4>Current Status:</h4>
                    <p><strong>Outstanding Amount:</strong> {{currency outstandingAmount}}</p>
                    <p><strong>Next Due Date:</strong> {{date nextDueDate}}</p>
                </div>
                
                <p>Please review your statement and contact us if you have any questions.</p>
            </div>
        </div>
    </div>
</body>
</html>`
    };

    return templates[templateName] || '';
  }

  async saveTemplate(template) {
    try {
      // Save to database
      const existingTemplate = await prisma.notificationTemplate.findUnique({
        where: {
          type_name: {
            type: template.type,
            name: template.name
          }
        }
      });

      if (existingTemplate) {
        await prisma.notificationTemplate.update({
          where: { templateId: existingTemplate.templateId },
          data: {
            subject: template.subject,
            content: template.content,
            variables: template.variables,
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.notificationTemplate.create({
          data: {
            type: template.type,
            name: template.name,
            subject: template.subject,
            content: template.content,
            variables: template.variables,
            isActive: true,
            version: 1
          }
        });
      }

      // Save to file system for backup
      const templateDir = path.join(this.templatesPath, template.type.toLowerCase());
      await fs.mkdir(templateDir, { recursive: true });
      
      const templateFile = path.join(templateDir, `${template.name}.json`);
      await fs.writeFile(templateFile, JSON.stringify(template, null, 2));

      console.log(`Template saved: ${template.type}/${template.name}`);
    } catch (error) {
      console.error(`Failed to save template ${template.name}:`, error);
    }
  }

  async getTemplate(type, name) {
    try {
      const template = await prisma.notificationTemplate.findUnique({
        where: {
          type_name: { type, name },
          isActive: true
        }
      });

      return template;
    } catch (error) {
      console.error(`Failed to get template ${type}/${name}:`, error);
      return null;
    }
  }

  async renderTemplate(type, name, variables = {}) {
    try {
      const template = await this.getTemplate(type, name);
      
      if (!template) {
        throw new Error(`Template not found: ${type}/${name}`);
      }

      const cacheKey = `${type}/${name}/${template.version}`;
      
      // Check if template is already compiled
      if (!this.compiledTemplates.has(cacheKey)) {
        const compiledSubject = template.subject ? Handlebars.compile(template.subject) : null;
        const compiledContent = Handlebars.compile(template.content);
        
        this.compiledTemplates.set(cacheKey, {
          subject: compiledSubject,
          content: compiledContent
        });
      }

      const compiled = this.compiledTemplates.get(cacheKey);
      
      return {
        subject: compiled.subject ? compiled.subject(variables) : null,
        content: compiled.content(variables),
        variables: template.variables
      };
    } catch (error) {
      console.error(`Failed to render template ${type}/${name}:`, error);
      throw error;
    }
  }

  async createTemplate(templateData) {
    try {
      const { type, name, subject, content, variables = [], description } = templateData;

      // Validate template syntax
      try {
        Handlebars.compile(content);
        if (subject) {
          Handlebars.compile(subject);
        }
      } catch (error) {
        throw new Error(`Template syntax error: ${error.message}`);
      }

      const template = await prisma.notificationTemplate.create({
        data: {
          type,
          name,
          subject,
          content,
          variables,
          description,
          isActive: true,
          version: 1
        }
      });

      // Clear compiled template cache
      this.compiledTemplates.clear();

      return template;
    } catch (error) {
      console.error('Failed to create template:', error);
      throw error;
    }
  }

  async updateTemplate(templateId, updates) {
    try {
      // Validate template syntax if content is being updated
      if (updates.content) {
        try {
          Handlebars.compile(updates.content);
        } catch (error) {
          throw new Error(`Template content syntax error: ${error.message}`);
        }
      }

      if (updates.subject) {
        try {
          Handlebars.compile(updates.subject);
        } catch (error) {
          throw new Error(`Template subject syntax error: ${error.message}`);
        }
      }

      const template = await prisma.notificationTemplate.update({
        where: { templateId },
        data: {
          ...updates,
          version: { increment: 1 },
          updatedAt: new Date()
        }
      });

      // Clear compiled template cache
      this.compiledTemplates.clear();

      return template;
    } catch (error) {
      console.error('Failed to update template:', error);
      throw error;
    }
  }

  async listTemplates(type = null, isActive = true) {
    try {
      const whereClause = { isActive };
      if (type) {
        whereClause.type = type;
      }

      const templates = await prisma.notificationTemplate.findMany({
        where: whereClause,
        orderBy: [
          { type: 'asc' },
          { name: 'asc' }
        ]
      });

      return templates;
    } catch (error) {
      console.error('Failed to list templates:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId) {
    try {
      const template = await prisma.notificationTemplate.update({
        where: { templateId },
        data: {
          isActive: false,
          deletedAt: new Date()
        }
      });

      // Clear compiled template cache
      this.compiledTemplates.clear();

      return template;
    } catch (error) {
      console.error('Failed to delete template:', error);
      throw error;
    }
  }

  async previewTemplate(type, name, sampleVariables = {}) {
    try {
      const template = await this.getTemplate(type, name);
      
      if (!template) {
        throw new Error(`Template not found: ${type}/${name}`);
      }

      // Use sample data if no variables provided
      const defaultSampleData = {
        customerName: 'John Doe',
        phoneNumber: '+919876543210',
        applicationNumber: 'APP123456',
        loanNumber: 'LOAN789012',
        requestedAmount: 50000,
        approvedAmount: 45000,
        paymentAmount: 5000,
        receiptNumber: 'RCP001234',
        interestRate: 12.5,
        tenure: 12,
        emiAmount: 4000,
        dueDate: new Date(),
        paymentDate: new Date(),
        registrationDate: new Date(),
        outstandingAmount: 40000,
        nextDueDate: new Date(),
        period: 'January 2024',
        otp: '123456',
        status: 'Approved',
        visitDate: new Date(),
        visitTime: '10:00 AM',
        loanTrackingUrl: 'https://app.gptgoldloan.com/track/LOAN789012'
      };

      const variables = { ...defaultSampleData, ...sampleVariables };
      
      return await this.renderTemplate(type, name, variables);
    } catch (error) {
      console.error('Failed to preview template:', error);
      throw error;
    }
  }

  async getTemplateUsageStats() {
    try {
      // This would typically come from notification logs
      // For now, return mock data
      const stats = await prisma.notificationTemplate.findMany({
        where: { isActive: true },
        select: {
          templateId: true,
          type: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          version: true
        }
      });

      return stats.map(template => ({
        ...template,
        usageCount: Math.floor(Math.random() * 1000), // Mock data
        lastUsed: new Date(),
        successRate: 98.5 + Math.random() * 1.5 // Mock data
      }));
    } catch (error) {
      console.error('Failed to get template usage stats:', error);
      throw error;
    }
  }

  // A/B Testing for templates
  async createTemplateVariant(originalTemplateId, variantData) {
    try {
      const originalTemplate = await prisma.notificationTemplate.findUnique({
        where: { templateId: originalTemplateId }
      });

      if (!originalTemplate) {
        throw new Error('Original template not found');
      }

      const variant = await prisma.notificationTemplate.create({
        data: {
          type: originalTemplate.type,
          name: `${originalTemplate.name}_variant_${Date.now()}`,
          subject: variantData.subject || originalTemplate.subject,
          content: variantData.content || originalTemplate.content,
          variables: originalTemplate.variables,
          description: `A/B test variant of ${originalTemplate.name}`,
          isActive: true,
          version: 1,
          parentTemplateId: originalTemplateId
        }
      });

      return variant;
    } catch (error) {
      console.error('Failed to create template variant:', error);
      throw error;
    }
  }

  // Multi-language support
  async createTranslation(templateId, language, translatedContent) {
    try {
      const template = await prisma.notificationTemplate.findUnique({
        where: { templateId }
      });

      if (!template) {
        throw new Error('Template not found');
      }

      const translation = await prisma.templateTranslation.create({
        data: {
          templateId,
          language,
          subject: translatedContent.subject,
          content: translatedContent.content
        }
      });

      return translation;
    } catch (error) {
      console.error('Failed to create template translation:', error);
      throw error;
    }
  }

  async getTemplateTranslation(templateId, language) {
    try {
      const translation = await prisma.templateTranslation.findUnique({
        where: {
          templateId_language: {
            templateId,
            language
          }
        }
      });

      return translation;
    } catch (error) {
      console.error('Failed to get template translation:', error);
      return null;
    }
  }
}

module.exports = NotificationTemplateService;