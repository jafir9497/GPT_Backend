export interface PaymentGatewayConfig {
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  };
  payu?: {
    merchantId: string;
    merchantKey: string;
    merchantSalt: string;
  };
}

export interface PaymentRequest {
  loanId: string;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  scheduleDate?: Date;
  isPartialPayment: boolean;
  notes?: string;
  customerDetails?: {
    name: string;
    email?: string;
    contact: string;
  };
}

export interface PaymentResponse {
  success: boolean;
  data?: {
    payment: PaymentRecord;
    paymentGateway?: {
      orderId: string;
      amount: number;
      currency: string;
      redirectUrl?: string;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaymentRecord {
  paymentId: string;
  loanId: string;
  paymentNumber: string;
  paymentAmount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  principalPayment: number;
  interestPayment: number;
  penaltyPayment: number;
  processingFeePayment: number;
  collectedBy?: string;
  collectionLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  receiptNumber?: string;
  receiptGeneratedAt?: Date;
  customerSignature?: string;
  paymentProof?: string[];
  verificationStatus: VerificationStatus;
  gatewayTransactionId?: string;
  gatewayResponse?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentAllocationRequest {
  paymentAmount: number;
  outstandingPrincipal: number;
  outstandingInterest: number;
  penaltyAmount: number;
  processingFeeOutstanding: number;
}

export interface PaymentAllocationResponse {
  principalPayment: number;
  interestPayment: number;
  penaltyPayment: number;
  processingFeePayment: number;
  remainingAmount: number;
  allocationDetails: {
    priority: string;
    amount: number;
    description: string;
  }[];
}

export interface PaymentMethodInfo {
  method: PaymentMethod;
  name: string;
  description: string;
  icon: string;
  minAmount: number;
  maxAmount: number;
  processingFee: number;
  processingFeeType: 'percentage' | 'flat';
  isOnline: boolean;
  isOfflineSupported: boolean;
  estimatedProcessingTime: string;
  supportedCurrencies: string[];
}

export interface PaymentSchedule {
  scheduleId: string;
  loanId: string;
  emiNumber: number;
  dueDate: Date;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipal: number;
  status: EMIStatus;
  penaltyAmount?: number;
  totalDue?: number;
  paidDate?: Date;
  paidAmount?: number;
  paymentIds?: string[];
}

export interface RefundRequest {
  paymentId: string;
  refundAmount?: number; // If not provided, full refund
  reason: string;
  notes?: string;
  processedBy: string;
}

export interface RefundResponse {
  success: boolean;
  data?: {
    refundId: string;
    paymentId: string;
    refundAmount: number;
    status: RefundStatus;
    estimatedSettlement: Date;
    gatewayRefundId?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaymentReport {
  reportId: string;
  reportType: PaymentReportType;
  parameters: {
    startDate: Date;
    endDate: Date;
    loanId?: string;
    customerId?: string;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
  };
  summary: {
    totalPayments: number;
    totalAmount: number;
    principalCollected: number;
    interestCollected: number;
    penaltyCollected: number;
    refundAmount: number;
    averagePaymentAmount: number;
    paymentMethodBreakdown: Record<PaymentMethod, number>;
    statusBreakdown: Record<PaymentStatus, number>;
  };
  details: PaymentRecord[];
  generatedAt: Date;
  generatedBy: string;
}

// Enums
export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  DEBIT_CARD = 'DEBIT_CARD',
  CREDIT_CARD = 'CREDIT_CARD',
  NET_BANKING = 'NET_BANKING',
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
  EMI = 'EMI',
  CHEQUE = 'CHEQUE',
  DD = 'DD', // Demand Draft
}

export enum PaymentType {
  EMI = 'EMI',
  PART_PAYMENT = 'PART_PAYMENT',
  FULL_PAYMENT = 'FULL_PAYMENT',
  INTEREST_ONLY = 'INTEREST_ONLY',
  PENALTY_PAYMENT = 'PENALTY_PAYMENT',
  PROCESSING_FEE = 'PROCESSING_FEE',
  ADVANCE_PAYMENT = 'ADVANCE_PAYMENT',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  SCHEDULED = 'SCHEDULED',
  OVERDUE = 'OVERDUE',
}

export enum VerificationStatus {
  VERIFIED = 'VERIFIED',
  PENDING = 'PENDING',
  DISPUTED = 'DISPUTED',
  REJECTED = 'REJECTED',
}

export enum EMIStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  WAIVED = 'WAIVED',
}

export enum RefundStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentReportType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM',
  LOAN_WISE = 'LOAN_WISE',
  CUSTOMER_WISE = 'CUSTOMER_WISE',
  METHOD_WISE = 'METHOD_WISE',
}

// Webhook event types
export enum WebhookEventType {
  PAYMENT_CAPTURED = 'payment.captured',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_AUTHORIZED = 'payment.authorized',
  ORDER_PAID = 'order.paid',
  REFUND_CREATED = 'refund.created',
  REFUND_PROCESSED = 'refund.processed',
  SUBSCRIPTION_CHARGED = 'subscription.charged',
  SUBSCRIPTION_CANCELLED = 'subscription.cancelled',
}

// Collection method for offline payments
export enum CollectionMethod {
  OFFICE_VISIT = 'OFFICE_VISIT',
  HOME_COLLECTION = 'HOME_COLLECTION',
  ONLINE = 'ONLINE',
  ATM = 'ATM',
  BANK_BRANCH = 'BANK_BRANCH',
}

// Payment priority for allocation
export enum PaymentPriority {
  PROCESSING_FEE = 1,
  PENALTY = 2,
  INTEREST = 3,
  PRINCIPAL = 4,
}

export interface PaymentValidationRules {
  minAmount: number;
  maxAmount: number;
  allowedMethods: PaymentMethod[];
  maxDailyAmount?: number;
  maxMonthlyAmount?: number;
  requireVerification: boolean;
  allowPartialPayments: boolean;
  gracePeriodDays: number;
  penaltyRate: number; // Annual percentage
  processingFeeRate: number; // Percentage
}

export interface PaymentAnalytics {
  totalPayments: number;
  totalAmount: number;
  averagePaymentAmount: number;
  paymentTrends: {
    date: string;
    amount: number;
    count: number;
  }[];
  methodWiseBreakdown: {
    method: PaymentMethod;
    count: number;
    amount: number;
    percentage: number;
  }[];
  statusWiseBreakdown: {
    status: PaymentStatus;
    count: number;
    amount: number;
    percentage: number;
  }[];
  collectionEfficiency: {
    onTimePayments: number;
    overduePayments: number;
    totalDue: number;
    collectionRate: number;
  };
}