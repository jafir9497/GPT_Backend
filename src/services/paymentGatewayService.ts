import Razorpay = require('razorpay');
import crypto from 'crypto';
import { PaymentGatewayConfig } from '../types/payment.types';

export interface PaymentGatewayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
  notes?: Record<string, string>;
}

export interface PaymentVerification {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentGatewayResult {
  success: boolean;
  orderId?: string;
  paymentId?: string;
  signature?: string;
  amount?: number;
  status?: string;
  method?: string;
  error?: string;
  gatewayResponse?: any;
}

export class PaymentGatewayService {
  private razorpayInstance: Razorpay;
  private config: PaymentGatewayConfig;

  constructor(config: PaymentGatewayConfig) {
    this.config = config;
    this.razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  /**
   * Create Razorpay order for payment
   */
  async createRazorpayOrder(
    amount: number,
    currency: string = 'INR',
    receipt: string,
    notes?: Record<string, string>
  ): Promise<PaymentGatewayOrder> {
    try {
      const options = {
        amount: Math.round(amount * 100), // Amount in paise
        currency,
        receipt,
        notes: {
          ...notes,
          created_by: 'gpt_gold_loan_app',
          timestamp: new Date().toISOString(),
        },
      };

      const order = await this.razorpayInstance.orders.create(options);
      
      return {
        id: order.id || '',
        amount: Number(order.amount || 0) / 100, // Convert back to rupees
        currency: order.currency || 'INR',
        receipt: order.receipt || '',
        status: order.status || 'created',
        created_at: order.created_at || Date.now(),
        notes: (order.notes as any) || {},
      };
    } catch (error: any) {
      throw new Error(`Failed to create Razorpay order: ${error.message}`);
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    try {
      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', this.config.razorpay.keySecret)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Error verifying Razorpay signature:', error);
      return false;
    }
  }

  /**
   * Get payment details from Razorpay
   */
  async getPaymentDetails(paymentId: string): Promise<any> {
    try {
      return await this.razorpayInstance.payments.fetch(paymentId);
    } catch (error: any) {
      throw new Error(`Failed to fetch payment details: ${error.message}`);
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(
    paymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<any> {
    try {
      const refundData: any = {
        notes: {
          ...notes,
          refunded_by: 'gpt_gold_loan_app',
          timestamp: new Date().toISOString(),
        },
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Amount in paise
      }

      return await this.razorpayInstance.payments.refund(paymentId, refundData);
    } catch (error: any) {
      throw new Error(`Failed to refund payment: ${error.message}`);
    }
  }

  /**
   * Process payment verification and update status
   */
  async processPaymentVerification(
    verification: PaymentVerification,
    expectedAmount: number,
    loanId: string
  ): Promise<PaymentGatewayResult> {
    try {
      // Verify signature
      const isSignatureValid = this.verifyRazorpaySignature(
        verification.razorpay_order_id,
        verification.razorpay_payment_id,
        verification.razorpay_signature
      );

      if (!isSignatureValid) {
        return {
          success: false,
          error: 'Invalid payment signature',
        };
      }

      // Get payment details from Razorpay
      const paymentDetails = await this.getPaymentDetails(verification.razorpay_payment_id);

      // Verify amount
      const paidAmount = paymentDetails.amount / 100; // Convert from paise to rupees
      if (Math.abs(paidAmount - expectedAmount) > 0.01) {
        return {
          success: false,
          error: `Amount mismatch. Expected: ${expectedAmount}, Paid: ${paidAmount}`,
          gatewayResponse: paymentDetails,
        };
      }

      // Check payment status
      if (paymentDetails.status !== 'captured') {
        return {
          success: false,
          error: `Payment not captured. Status: ${paymentDetails.status}`,
          gatewayResponse: paymentDetails,
        };
      }

      return {
        success: true,
        orderId: verification.razorpay_order_id,
        paymentId: verification.razorpay_payment_id,
        signature: verification.razorpay_signature,
        amount: paidAmount,
        status: paymentDetails.status,
        method: paymentDetails.method,
        gatewayResponse: paymentDetails,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Payment verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Create payment link for remote payments
   */
  async createPaymentLink(
    amount: number,
    description: string,
    customerDetails: {
      name: string;
      email?: string;
      contact: string;
    },
    callbackUrl?: string,
    expiryTime?: Date
  ): Promise<any> {
    try {
      const options: any = {
        amount: Math.round(amount * 100), // Amount in paise
        currency: 'INR',
        description,
        customer: {
          name: customerDetails.name,
          contact: customerDetails.contact,
        },
        notify: {
          sms: true,
          email: Boolean(customerDetails.email),
        },
        reminder_enable: true,
        notes: {
          created_by: 'gpt_gold_loan_app',
          timestamp: new Date().toISOString(),
        },
      };

      if (customerDetails.email) {
        options.customer.email = customerDetails.email;
      }

      if (callbackUrl) {
        options.callback_url = callbackUrl;
        options.callback_method = 'get';
      }

      if (expiryTime) {
        options.expire_by = Math.floor(expiryTime.getTime() / 1000);
      }

      return await this.razorpayInstance.paymentLink.create(options);
    } catch (error: any) {
      throw new Error(`Failed to create payment link: ${error.message}`);
    }
  }

  /**
   * Cancel payment link
   */
  async cancelPaymentLink(paymentLinkId: string): Promise<any> {
    try {
      return await this.razorpayInstance.paymentLink.cancel(paymentLinkId);
    } catch (error: any) {
      throw new Error(`Failed to cancel payment link: ${error.message}`);
    }
  }

  /**
   * Create subscription for recurring payments
   */
  async createSubscription(
    planId: string,
    customerEmail: string,
    customerContact: string,
    totalCount?: number,
    notes?: Record<string, string>
  ): Promise<any> {
    try {
      const options: any = {
        plan_id: planId,
        customer_notify: 1,
        quantity: 1,
        notes: {
          ...notes,
          created_by: 'gpt_gold_loan_app',
          timestamp: new Date().toISOString(),
        },
        addons: [],
      };

      if (totalCount) {
        options.total_count = totalCount;
      }

      return await this.razorpayInstance.subscriptions.create(options);
    } catch (error: any) {
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Get all payment methods supported by gateway
   */
  getSupportedPaymentMethods(): Array<{
    method: string;
    name: string;
    description: string;
    minAmount: number;
    maxAmount: number;
    processingFee: number;
  }> {
    return [
      {
        method: 'upi',
        name: 'UPI',
        description: 'Pay using UPI apps like GPay, PhonePe, Paytm',
        minAmount: 1,
        maxAmount: 100000,
        processingFee: 0,
      },
      {
        method: 'card',
        name: 'Debit/Credit Card',
        description: 'Pay using your debit or credit card',
        minAmount: 1,
        maxAmount: 500000,
        processingFee: 2.95, // Percentage
      },
      {
        method: 'netbanking',
        name: 'Net Banking',
        description: 'Pay using your bank account',
        minAmount: 1,
        maxAmount: 500000,
        processingFee: 0.95, // Percentage
      },
      {
        method: 'wallet',
        name: 'Digital Wallet',
        description: 'Pay using wallets like Paytm, Mobikwik',
        minAmount: 1,
        maxAmount: 50000,
        processingFee: 1.5, // Percentage
      },
      {
        method: 'emi',
        name: 'EMI',
        description: 'Pay in easy monthly installments',
        minAmount: 1000,
        maxAmount: 500000,
        processingFee: 3.5, // Percentage
      },
    ];
  }

  /**
   * Calculate processing fees for different payment methods
   */
  calculateProcessingFee(amount: number, method: string): number {
    const methods = this.getSupportedPaymentMethods();
    const methodConfig = methods.find(m => m.method === method);
    
    if (!methodConfig) {
      return 0;
    }

    // Flat fee or percentage based
    if (methodConfig.processingFee < 10) {
      // Percentage
      return Math.round((amount * methodConfig.processingFee / 100) * 100) / 100;
    } else {
      // Flat fee
      return methodConfig.processingFee;
    }
  }

  /**
   * Validate payment amount for method
   */
  validatePaymentAmount(amount: number, method: string): {
    valid: boolean;
    error?: string;
  } {
    const methods = this.getSupportedPaymentMethods();
    const methodConfig = methods.find(m => m.method === method);
    
    if (!methodConfig) {
      return {
        valid: false,
        error: 'Unsupported payment method',
      };
    }

    if (amount < methodConfig.minAmount) {
      return {
        valid: false,
        error: `Minimum amount for ${methodConfig.name} is ₹${methodConfig.minAmount}`,
      };
    }

    if (amount > methodConfig.maxAmount) {
      return {
        valid: false,
        error: `Maximum amount for ${methodConfig.name} is ₹${methodConfig.maxAmount}`,
      };
    }

    return { valid: true };
  }

  /**
   * Handle webhook notifications from payment gateway
   */
  async handleWebhook(
    event: string,
    payload: any,
    signature: string
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', this.config.razorpay.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (expectedSignature !== signature) {
        return {
          success: false,
          error: 'Invalid webhook signature',
        };
      }

      // Process different webhook events
      switch (event) {
        case 'payment.captured':
          return await this.handlePaymentCaptured(payload.payment);
        
        case 'payment.failed':
          return await this.handlePaymentFailed(payload.payment);
        
        case 'order.paid':
          return await this.handleOrderPaid(payload.order);
        
        case 'refund.created':
          return await this.handleRefundCreated(payload.refund);
        
        default:
          return {
            success: true,
            data: { message: `Webhook event ${event} received but not processed` },
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Webhook processing failed: ${error.message}`,
      };
    }
  }

  private async handlePaymentCaptured(payment: any): Promise<any> {
    // Implementation would update payment status in database
    return {
      success: true,
      data: { 
        paymentId: payment.id,
        status: 'captured',
        amount: payment.amount / 100,
      },
    };
  }

  private async handlePaymentFailed(payment: any): Promise<any> {
    // Implementation would update payment status in database
    return {
      success: true,
      data: {
        paymentId: payment.id,
        status: 'failed',
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
      },
    };
  }

  private async handleOrderPaid(order: any): Promise<any> {
    // Implementation would update order status in database
    return {
      success: true,
      data: {
        orderId: order.id,
        status: 'paid',
        amount: order.amount / 100,
      },
    };
  }

  private async handleRefundCreated(refund: any): Promise<any> {
    // Implementation would update refund status in database
    return {
      success: true,
      data: {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount / 100,
        status: refund.status,
      },
    };
  }

  /**
   * Get payment gateway transaction fee breakdown
   */
  getTransactionFeeBreakdown(amount: number, method: string): {
    baseAmount: number;
    processingFee: number;
    gst: number;
    totalAmount: number;
  } {
    const baseAmount = amount;
    const processingFee = this.calculateProcessingFee(amount, method);
    const gst = Math.round((processingFee * 0.18) * 100) / 100; // 18% GST on processing fee
    const totalAmount = baseAmount + processingFee + gst;

    return {
      baseAmount,
      processingFee,
      gst,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  }
}