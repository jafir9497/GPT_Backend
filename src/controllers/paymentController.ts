import { Request, Response } from 'express';
import { AuthRequest } from '../types/express';
import { PrismaClient, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { PaymentGatewayService } from '../services/paymentGatewayService';
import { getNotificationService } from '../services/notificationService';

const prisma = new PrismaClient();

// Initialize payment gateway service
const paymentGatewayConfig = {
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  }
};

const paymentGatewayService = new PaymentGatewayService(paymentGatewayConfig);

// Initiate payment
export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      loanId,
      paymentAmount,
      paymentMethod,
      notes
    } = req.body;

    const userId = req.user!.userId;

    // Validate required fields
    if (!loanId || !paymentAmount || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields'
        }
      });
      return;
    }

    // Verify loan ownership
    const loan = await prisma.activeLoan.findFirst({
      where: {
        loanId,
        customerId: userId
      },
      include: {
        application: {
          select: {
            applicationNumber: true
          }
        }
      }
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Loan not found'
        }
      });
      return;
    }

    // Validate payment amount
    const amount = new Prisma.Decimal(paymentAmount);
    if (amount.lte(0) || amount.gt(loan.totalOutstanding)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Invalid payment amount'
        }
      });
      return;
    }

    // Generate payment number
    const paymentNumber = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Calculate payment breakdown
    const paymentBreakdown = calculatePaymentBreakdown(
      amount,
      loan.accruedInterest,
      loan.outstandingPrincipal
    );

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        loanId,
        paymentNumber,
        paymentAmount: amount,
        paymentMethod: paymentMethod as PaymentMethod,
        paymentStatus: PaymentStatus.PENDING,
        principalPayment: paymentBreakdown.principal,
        interestPayment: paymentBreakdown.interest,
        penaltyPayment: paymentBreakdown.penalty || new Prisma.Decimal(0),
        gatewayTransactionId: paymentMethod !== 'CASH' ? uuidv4() : null,
        collectedBy: userId
      }
    });

    // For online payments, generate payment gateway URL/token
    let paymentGatewayData = null;
    if (paymentMethod !== 'CASH') {
      paymentGatewayData = await generatePaymentGatewayData(payment, loan);
    }

    res.status(201).json({
      success: true,
      data: {
        payment: {
          ...payment,
          loan: {
            loanNumber: loan.loanNumber,
            applicationNumber: loan.application.applicationNumber
          }
        },
        paymentBreakdown,
        ...(paymentGatewayData && { paymentGateway: paymentGatewayData })
      }
    });

  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to initiate payment'
      }
    });
  }
};

// Update payment status (webhook/manual)
export const updatePaymentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const {
      status,
      gatewayTransactionId,
      gatewayResponse,
      failureReason,
      paymentDate,
      collectedBy,
      collectionLocation
    } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { paymentId },
      include: {
        loan: true
      }
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
      return;
    }

    // Update payment
    const updatedPayment = await prisma.payment.update({
      where: { paymentId },
      data: {
        paymentStatus: status,
        gatewayTransactionId: gatewayTransactionId || payment.gatewayTransactionId,
        gatewayResponse: gatewayResponse || {},
        paymentDate: paymentDate ? new Date(paymentDate) : (status === 'COMPLETED' ? new Date() : payment.paymentDate),
        collectedBy,
        collectionLocation,
        updatedAt: new Date()
      }
    });

    // If payment is completed, update loan outstanding
    if (status === PaymentStatus.COMPLETED) {
      await updateLoanOutstanding(payment.loanId, payment.paymentAmount);
    }

    res.json({
      success: true,
      data: { payment: updatedPayment }
    });

  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update payment status'
      }
    });
  }
};

// Get customer payments
export const getCustomerPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { loanId, page = 1, limit = 10, status, startDate, endDate } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {
      loan: {
        customerId: userId
      }
    };

    if (loanId) {
      whereClause.loanId = loanId;
    }

    if (status) {
      whereClause.paymentStatus = status;
    }

    if (startDate || endDate) {
      whereClause.paymentDate = {};
      if (startDate) {
        whereClause.paymentDate.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.paymentDate.lte = new Date(endDate as string);
      }
    }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: {
        paymentDate: 'desc'
      },
      include: {
        loan: {
          select: {
            loanNumber: true,
            application: {
              select: {
                applicationNumber: true
              }
            }
          }
        }
      }
    });

    const total = await prisma.payment.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Get customer payments error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve payments'
      }
    });
  }
};

// Get payment details
export const getPaymentDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user!.userId;

    const payment = await prisma.payment.findFirst({
      where: {
        paymentId,
        loan: {
          customerId: userId
        }
      },
      include: {
        loan: {
          include: {
            application: {
              select: {
                applicationNumber: true,
                loanPurpose: true
              }
            },
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: { payment }
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve payment details'
      }
    });
  }
};


// Get payment methods and fees
export const getPaymentMethods = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const paymentMethods = [
      {
        method: 'UPI',
        label: 'UPI Payment',
        description: 'Pay using UPI apps like GPay, PhonePe, Paytm',
        fee: 0,
        feeType: 'percentage',
        isOnline: true,
        processingTime: 'Instant',
        icon: 'upi'
      },
      {
        method: 'DEBIT_CARD',
        label: 'Debit Card',
        description: 'Pay using your debit card',
        fee: 0.5,
        feeType: 'percentage',
        isOnline: true,
        processingTime: 'Instant',
        icon: 'card'
      },
      {
        method: 'CREDIT_CARD',
        label: 'Credit Card',
        description: 'Pay using your credit card',
        fee: 1.5,
        feeType: 'percentage',
        isOnline: true,
        processingTime: 'Instant',
        icon: 'card'
      },
      {
        method: 'NET_BANKING',
        label: 'Net Banking',
        description: 'Pay using your bank account',
        fee: 0,
        feeType: 'percentage',
        isOnline: true,
        processingTime: 'Instant',
        icon: 'bank'
      },
      {
        method: 'CASH',
        label: 'Cash Payment',
        description: 'Pay cash to our field agent',
        fee: 0,
        feeType: 'fixed',
        isOnline: false,
        processingTime: 'Manual verification required',
        icon: 'cash'
      },
      {
        method: 'BANK_TRANSFER',
        label: 'Bank Transfer',
        description: 'Transfer directly to our bank account',
        fee: 0,
        feeType: 'fixed',
        isOnline: false,
        processingTime: '2-3 hours',
        icon: 'bank'
      }
    ];

    res.json({
      success: true,
      data: { paymentMethods }
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve payment methods'
      }
    });
  }
};

// Calculate payment fees
export const calculatePaymentFees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount, paymentMethod } = req.body;

    if (!amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Amount and payment method are required'
        }
      });
      return;
    }

    const feeRates: Record<string, { rate: number; type: 'percentage' | 'fixed' }> = {
      'UPI': { rate: 0, type: 'percentage' },
      'DEBIT_CARD': { rate: 0.5, type: 'percentage' },
      'CREDIT_CARD': { rate: 1.5, type: 'percentage' },
      'NET_BANKING': { rate: 0, type: 'percentage' },
      'CASH': { rate: 0, type: 'fixed' },
      'BANK_TRANSFER': { rate: 0, type: 'fixed' }
    };

    const feeConfig = feeRates[paymentMethod] || { rate: 0, type: 'fixed' };
    const paymentAmount = parseFloat(amount);
    
    let fee = 0;
    if (feeConfig.type === 'percentage') {
      fee = (paymentAmount * feeConfig.rate) / 100;
    } else {
      fee = feeConfig.rate;
    }

    const totalAmount = paymentAmount + fee;

    res.json({
      success: true,
      data: {
        paymentAmount,
        fee,
        totalAmount,
        feeRate: feeConfig.rate,
        feeType: feeConfig.type
      }
    });

  } catch (error) {
    console.error('Calculate payment fees error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to calculate payment fees'
      }
    });
  }
};

// Helper function to calculate payment breakdown
function calculatePaymentBreakdown(
  paymentAmount: Prisma.Decimal,
  accruedInterest: Prisma.Decimal,
  outstandingPrincipal: Prisma.Decimal
) {
  let remainingAmount = paymentAmount;
  
  // First pay accrued interest
  const interestPayment = Prisma.Decimal.min(remainingAmount, accruedInterest);
  remainingAmount = remainingAmount.sub(interestPayment);
  
  // Then pay principal
  const principalPayment = Prisma.Decimal.min(remainingAmount, outstandingPrincipal);
  remainingAmount = remainingAmount.sub(principalPayment);
  
  // Any remaining amount goes to penalty (if applicable)
  const penaltyPayment = remainingAmount;

  return {
    interest: interestPayment,
    principal: principalPayment,
    penalty: penaltyPayment
  };
}

// Helper function to update loan outstanding
async function updateLoanOutstanding(loanId: string, paymentAmount: Prisma.Decimal) {
  const loan = await prisma.activeLoan.findUnique({
    where: { loanId }
  });

  if (!loan) return;

  const paymentBreakdown = calculatePaymentBreakdown(
    paymentAmount,
    loan.accruedInterest,
    loan.outstandingPrincipal
  );

  const newOutstandingPrincipal = loan.outstandingPrincipal.sub(paymentBreakdown.principal);
  const newAccruedInterest = loan.accruedInterest.sub(paymentBreakdown.interest);
  const newTotalOutstanding = newOutstandingPrincipal.add(newAccruedInterest);

  await prisma.activeLoan.update({
    where: { loanId },
    data: {
      outstandingPrincipal: newOutstandingPrincipal,
      accruedInterest: newAccruedInterest,
      totalOutstanding: newTotalOutstanding,
      lastPaymentDate: new Date(),
      updatedAt: new Date()
    }
  });
}

// Helper function to generate payment gateway data
async function generatePaymentGatewayData(payment: any, loan: any) {
  try {
    // Create order with payment gateway
    const gatewayOrder = await paymentGatewayService.createRazorpayOrder(
      payment.paymentAmount.toNumber(),
      'INR',
      payment.paymentNumber,
      {
        loan_id: payment.loanId,
        payment_id: payment.paymentId,
        customer_id: loan.customerId,
        loan_number: loan.loanNumber,
      }
    );

    // Update payment with gateway order ID
    await prisma.payment.update({
      where: { paymentId: payment.paymentId },
      data: {
        gatewayTransactionId: gatewayOrder.id,
        gatewayResponse: gatewayOrder as any,
      }
    });

    return {
      orderId: gatewayOrder.id,
      keyId: paymentGatewayConfig.razorpay.keyId,
      amount: gatewayOrder.amount, // Amount in paise
      currency: gatewayOrder.currency,
      description: `Payment for loan ${loan.loanNumber}`,
      receipt: gatewayOrder.receipt,
      customerDetails: {
        name: `${loan.customer?.firstName || ''} ${loan.customer?.lastName || ''}`.trim(),
        email: loan.customer?.email,
        contact: loan.customer?.phoneNumber,
      },
      notes: gatewayOrder.notes,
      callbackUrl: `${process.env.API_BASE_URL}/api/v1/payments/webhook`,
    };
  } catch (error: any) {
    console.error('Payment gateway order creation failed:', error);
    throw new Error(`Failed to create payment gateway order: ${error.message}`);
  }
}

// Verify payment from frontend
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !paymentId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required payment verification parameters'
        }
      });
      return;
    }

    // Find payment in database
    const payment = await prisma.payment.findUnique({
      where: { paymentId },
      include: {
        loan: {
          include: {
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                email: true,
              }
            }
          }
        }
      }
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
      return;
    }

    // Verify payment with gateway
    const verificationResult = await paymentGatewayService.processPaymentVerification(
      {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      payment.paymentAmount.toNumber(),
      payment.loanId
    );

    if (!verificationResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'PAYMENT_VERIFICATION_FAILED',
          message: verificationResult.error || 'Payment verification failed'
        }
      });
      return;
    }

    // Update payment status
    const updatedPayment = await prisma.payment.update({
      where: { paymentId },
      data: {
        paymentStatus: PaymentStatus.COMPLETED,
        gatewayTransactionId: razorpay_payment_id,
        gatewayResponse: verificationResult.gatewayResponse,
        paymentDate: new Date(),
        updatedAt: new Date(),
      }
    });

    // Update loan outstanding
    await updateLoanOutstanding(payment.loanId, payment.paymentAmount);

    // Send notification
    const notificationService = getNotificationService();
    if (notificationService && payment.loan.customer) {
      await notificationService.sendNotification({
        userId: payment.loan.customerId,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Successful',
        message: `Your payment of ₹${payment.paymentAmount} for loan ${payment.loan.loanNumber} has been processed successfully.`,
        priority: 'medium',
        data: {
          paymentId: payment.paymentId,
          loanId: payment.loanId,
          amount: payment.paymentAmount.toString(),
          paymentMethod: payment.paymentMethod,
        }
      } as any);
    }

    res.json({
      success: true,
      data: {
        payment: updatedPayment,
        verificationResult: {
          paymentId: verificationResult.paymentId,
          amount: verificationResult.amount,
          status: verificationResult.status,
          method: verificationResult.method,
        }
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to verify payment'
      }
    });
  }
};

// Handle payment webhook
export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'] as string;
    const webhookEvent = req.headers['x-razorpay-event'] as string;
    const webhookPayload = req.body;

    if (!webhookSignature || !webhookEvent) {
      res.status(400).json({
        success: false,
        error: 'Missing webhook headers'
      });
      return;
    }

    // Process webhook
    const webhookResult = await paymentGatewayService.handleWebhook(
      webhookEvent,
      webhookPayload,
      webhookSignature
    );

    if (!webhookResult.success) {
      res.status(400).json({
        success: false,
        error: webhookResult.error
      });
      return;
    }

    // Handle specific webhook events
    if (webhookEvent === 'payment.captured' && webhookPayload.payment) {
      await handlePaymentCapturedWebhook(webhookPayload.payment);
    } else if (webhookEvent === 'payment.failed' && webhookPayload.payment) {
      await handlePaymentFailedWebhook(webhookPayload.payment);
    }

    res.json({
      success: true,
      data: webhookResult.data
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
};

// Create payment link for remote collection
export const createPaymentLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId, amount, description, expiryHours = 24 } = req.body;
    const userId = req.user!.userId;

    // Verify loan and get customer details
    const loan = await prisma.activeLoan.findFirst({
      where: {
        loanId,
        customerId: userId
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            email: true,
          }
        }
      }
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Loan not found'
        }
      });
      return;
    }

    // Create payment link
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + expiryHours);

    const paymentLink = await paymentGatewayService.createPaymentLink(
      parseFloat(amount),
      description || `Payment for loan ${loan.loanNumber}`,
      {
        name: `${loan.customer?.firstName || ''} ${loan.customer?.lastName || ''}`.trim(),
        email: loan.customer?.email || undefined,
        contact: loan.customer?.phoneNumber || '',
      },
      `${process.env.FRONTEND_URL}/payment-success`,
      expiryTime
    );

    res.json({
      success: true,
      data: {
        paymentLink: {
          id: paymentLink.id,
          shortUrl: paymentLink.short_url,
          amount: paymentLink.amount / 100,
          currency: paymentLink.currency,
          description: paymentLink.description,
          status: paymentLink.status,
          expireBy: new Date(paymentLink.expire_by * 1000),
        }
      }
    });

  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create payment link'
      }
    });
  }
};

// Get payment methods with gateway support
export const getPaymentMethodsWithGateway = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.query;
    const paymentAmount = amount ? parseFloat(amount as string) : 0;

    // Get supported methods from gateway
    const gatewayMethods = paymentGatewayService.getSupportedPaymentMethods();

    // Map to our payment methods format
    const paymentMethods = gatewayMethods.map(method => {
      const validation = paymentAmount > 0 
        ? paymentGatewayService.validatePaymentAmount(paymentAmount, method.method)
        : { valid: true };

      const feeBreakdown = paymentAmount > 0
        ? paymentGatewayService.getTransactionFeeBreakdown(paymentAmount, method.method)
        : null;

      return {
        method: method.method,
        name: method.name,
        description: method.description,
        minAmount: method.minAmount,
        maxAmount: method.maxAmount,
        processingFee: method.processingFee,
        isAvailable: validation.valid,
        unavailableReason: validation.error,
        feeBreakdown,
      };
    });

    res.json({
      success: true,
      data: { 
        paymentMethods,
        requestedAmount: paymentAmount,
      }
    });

  } catch (error) {
    console.error('Get payment methods with gateway error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve payment methods'
      }
    });
  }
};

// Helper function to handle payment captured webhook
async function handlePaymentCapturedWebhook(payment: any): Promise<void> {
  try {
    // Find payment by gateway transaction ID
    const dbPayment = await prisma.payment.findFirst({
      where: {
        gatewayTransactionId: payment.order_id,
      },
      include: {
        loan: {
          include: {
            customer: true,
          }
        }
      }
    });

    if (!dbPayment) {
      console.error('Payment not found for webhook:', payment.id);
      return;
    }

    // Update payment status if not already updated
    if (dbPayment.paymentStatus !== PaymentStatus.COMPLETED) {
      await prisma.payment.update({
        where: { paymentId: dbPayment.paymentId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          gatewayResponse: payment,
          paymentDate: new Date(),
          updatedAt: new Date(),
        }
      });

      // Update loan outstanding
      await updateLoanOutstanding(dbPayment.loanId, dbPayment.paymentAmount);

      // Send success notification
      const notificationService = getNotificationService();
      if (notificationService && dbPayment.loan.customer) {
        await notificationService.sendNotification({
          userId: dbPayment.loan.customerId,
          type: 'PAYMENT_SUCCESS',
          title: 'Payment Successful',
          message: `Your payment of ₹${dbPayment.paymentAmount} for loan ${dbPayment.loan.loanNumber} has been processed successfully.`,
          priority: 'medium',
          data: {
            paymentId: dbPayment.paymentId,
            loanId: dbPayment.loanId,
            amount: dbPayment.paymentAmount.toString(),
            paymentMethod: dbPayment.paymentMethod,
          }
        } as any);
      }
    }
  } catch (error) {
    console.error('Error handling payment captured webhook:', error);
  }
}

// Helper function to handle payment failed webhook
async function handlePaymentFailedWebhook(payment: any): Promise<void> {
  try {
    // Find payment by gateway transaction ID
    const dbPayment = await prisma.payment.findFirst({
      where: {
        gatewayTransactionId: payment.order_id,
      },
      include: {
        loan: {
          include: {
            customer: true,
          }
        }
      }
    });

    if (!dbPayment) {
      console.error('Payment not found for failed webhook:', payment.id);
      return;
    }

    // Update payment status
    await prisma.payment.update({
      where: { paymentId: dbPayment.paymentId },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        gatewayResponse: payment,
        updatedAt: new Date(),
      }
    });

    // Send failure notification
    const notificationService = getNotificationService();
    if (notificationService && dbPayment.loan.customer) {
      await notificationService.sendNotification({
        userId: dbPayment.loan.customerId,
        type: 'PAYMENT_FAILED',
        title: 'Payment Failed',
        message: `Your payment of ₹${dbPayment.paymentAmount} for loan ${dbPayment.loan.loanNumber} has failed. Please try again or contact support.`,
        priority: 'high',
        data: {
          paymentId: dbPayment.paymentId,
          loanId: dbPayment.loanId,
          amount: dbPayment.paymentAmount.toString(),
          paymentMethod: dbPayment.paymentMethod,
          errorCode: payment.error_code,
          errorDescription: payment.error_description,
        }
      } as any);
    }
  } catch (error) {
    console.error('Error handling payment failed webhook:', error);
  }
}

// Record offline payment (for field agents)
export const recordOfflinePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      loanId,
      paymentAmount,
      paymentMethod,
      collectionDetails,
      paymentType = 'EMI',
      notes
    } = req.body;

    const userId = req.user!.userId;

    // Validate required fields
    if (!loanId || !paymentAmount || !paymentMethod || !collectionDetails) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: loanId, paymentAmount, paymentMethod, collectionDetails'
        }
      });
      return;
    }

    // Verify user is employee/admin
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userType: true, firstName: true, lastName: true }
    });

    if (!user || !['EMPLOYEE', 'ADMIN'].includes(user.userType)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only employees and admins can record offline payments'
        }
      });
      return;
    }

    // Verify loan exists
    const loan = await prisma.activeLoan.findUnique({
      where: { loanId },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        }
      }
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: {
          code: 'LOAN_NOT_FOUND',
          message: 'Loan not found'
        }
      });
      return;
    }

    // Validate payment amount
    const amount = parseFloat(paymentAmount.toString());
    if (amount <= 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Payment amount must be greater than 0'
        }
      });
      return;
    }

    // Generate payment and receipt numbers
    const paymentNumber = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const receiptNumber = `RCP${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Calculate payment allocation (principal vs interest)
    const outstandingPrincipal = parseFloat(loan.outstandingPrincipal.toString());
    const accruedInterest = parseFloat(loan.accruedInterest.toString());
    
    let principalPayment = 0;
    let interestPayment = 0;
    let penaltyPayment = 0;

    // Simple allocation logic - can be enhanced based on business rules
    if (paymentType === 'FULL') {
      principalPayment = Math.min(amount, outstandingPrincipal);
      interestPayment = Math.min(amount - principalPayment, accruedInterest);
    } else if (paymentType === 'INTEREST') {
      interestPayment = Math.min(amount, accruedInterest);
    } else {
      // EMI or PARTIAL - pay interest first, then principal
      interestPayment = Math.min(amount, accruedInterest);
      principalPayment = Math.min(amount - interestPayment, outstandingPrincipal);
    }

    // Store collection location if provided
    const collectionLocation = collectionDetails.location 
      ? `${collectionDetails.location.latitude},${collectionDetails.location.longitude}`
      : null;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        loanId,
        paymentNumber,
        paymentAmount: amount,
        paymentMethod: paymentMethod as PaymentMethod,
        paymentStatus: PaymentStatus.COMPLETED, // Offline payments are immediately completed
        principalPayment,
        interestPayment,
        penaltyPayment,
        collectedBy: userId,
        collectionLocation,
        collectionMethod: 'HOME_COLLECTION',
        receiptNumber,
        receiptGeneratedAt: new Date(),
        customerSignature: collectionDetails.customerSignature || undefined,
        paymentProof: collectionDetails.proofPhotos ? JSON.stringify(collectionDetails.proofPhotos) : undefined,
        verificationStatus: 'VERIFIED',
        paymentDate: new Date()
      }
    });

    // Update loan outstanding amounts
    const newOutstandingPrincipal = outstandingPrincipal - principalPayment;
    const newAccruedInterest = accruedInterest - interestPayment;
    const newTotalOutstanding = newOutstandingPrincipal + newAccruedInterest;

    // Calculate next due date (if EMI)
    let nextDueDate = loan.nextDueDate;
    if (paymentType === 'EMI' && loan.emiAmount && principalPayment > 0) {
      const currentDue = loan.nextDueDate || new Date();
      nextDueDate = new Date(currentDue);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    }

    await prisma.activeLoan.update({
      where: { loanId },
      data: {
        outstandingPrincipal: newOutstandingPrincipal,
        accruedInterest: newAccruedInterest,
        totalOutstanding: newTotalOutstanding,
        lastPaymentDate: new Date(),
        nextDueDate: nextDueDate,
        loanStatus: newOutstandingPrincipal <= 0 ? 'CLOSED' : loan.loanStatus
      }
    });

    // Send notification to customer
    const notificationService = getNotificationService();
    if (notificationService) {
      await notificationService.sendNotification({
        userId: loan.customerId,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Your payment of ₹${amount} for loan ${loan.loanNumber} has been received successfully.`,
        priority: 'medium',
        data: {
          paymentId: payment.paymentId,
          loanId: payment.loanId,
          amount: amount.toString(),
          paymentMethod: paymentMethod,
          receiptNumber: payment.receiptNumber,
          collectedBy: `${user.firstName} ${user.lastName}`
        }
      } as any);
    }

    res.status(201).json({
      success: true,
      data: {
        payment: {
          paymentId: payment.paymentId,
          paymentNumber: payment.paymentNumber,
          receiptNumber: payment.receiptNumber,
          paymentAmount: payment.paymentAmount,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.paymentDate,
          principalPayment: payment.principalPayment,
          interestPayment: payment.interestPayment,
          collectedBy: `${user.firstName} ${user.lastName}`,
          collectionLocation: collectionDetails.location
        },
        loanUpdate: {
          outstandingPrincipal: newOutstandingPrincipal,
          totalOutstanding: newTotalOutstanding,
          nextDueDate: nextDueDate,
          loanStatus: newOutstandingPrincipal <= 0 ? 'CLOSED' : loan.loanStatus
        },
        message: 'Offline payment recorded successfully'
      }
    });

  } catch (error) {
    console.error('Record offline payment error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to record offline payment'
      }
    });
  }
};