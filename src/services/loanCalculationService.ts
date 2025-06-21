import Decimal from 'decimal.js';

export interface LoanCalculationInput {
  principalAmount: number;
  interestRate: number; // Annual interest rate as percentage
  tenureMonths: number;
  loanStartDate: Date;
  calculationMethod: 'reducing_balance' | 'simple_interest';
  processingFeePercentage?: number;
  gracePeriodDays?: number;
  penaltyRatePercentage?: number;
}

export interface EMIScheduleItem {
  emiNumber: number;
  dueDate: Date;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipal: number;
  status: 'pending' | 'paid' | 'overdue';
  penaltyAmount?: number;
  totalDue?: number;
}

export interface LoanCalculationResult {
  monthlyEMI: number;
  totalInterest: number;
  totalAmount: number;
  processingFee: number;
  emiSchedule: EMIScheduleItem[];
  effectiveInterestRate: number;
}

export interface PaymentAllocation {
  principalPayment: number;
  interestPayment: number;
  penaltyPayment: number;
  processingFeePayment: number;
  remainingAmount: number;
}

export class LoanCalculationService {
  
  /**
   * Calculate EMI using reducing balance method
   */
  public static calculateReducingBalanceEMI(
    principal: number,
    annualRate: number,
    tenureMonths: number
  ): number {
    const monthlyRate = new Decimal(annualRate).div(12).div(100);
    const principalDecimal = new Decimal(principal);
    const tenureDecimal = new Decimal(tenureMonths);
    
    if (monthlyRate.isZero()) {
      return principalDecimal.div(tenureDecimal).toNumber();
    }
    
    const onePlusR = monthlyRate.plus(1);
    const powerTerm = onePlusR.pow(tenureDecimal);
    
    const emi = principalDecimal
      .mul(monthlyRate)
      .mul(powerTerm)
      .div(powerTerm.minus(1));
    
    return Math.round(emi.toNumber() * 100) / 100;
  }
  
  /**
   * Calculate EMI using simple interest method
   */
  public static calculateSimpleInterestEMI(
    principal: number,
    annualRate: number,
    tenureMonths: number
  ): number {
    const principalDecimal = new Decimal(principal);
    const annualRateDecimal = new Decimal(annualRate).div(100);
    const tenureYears = new Decimal(tenureMonths).div(12);
    
    const totalInterest = principalDecimal.mul(annualRateDecimal).mul(tenureYears);
    const totalAmount = principalDecimal.plus(totalInterest);
    
    return Math.round(totalAmount.div(tenureMonths).toNumber() * 100) / 100;
  }
  
  /**
   * Generate complete loan calculation with EMI schedule
   */
  public static calculateLoan(input: LoanCalculationInput): LoanCalculationResult {
    const {
      principalAmount,
      interestRate,
      tenureMonths,
      loanStartDate,
      calculationMethod,
      processingFeePercentage = 2
    } = input;
    
    // Calculate EMI based on method
    const monthlyEMI = calculationMethod === 'reducing_balance'
      ? this.calculateReducingBalanceEMI(principalAmount, interestRate, tenureMonths)
      : this.calculateSimpleInterestEMI(principalAmount, interestRate, tenureMonths);
    
    // Calculate processing fee
    const processingFee = Math.round((principalAmount * processingFeePercentage / 100) * 100) / 100;
    
    // Generate EMI schedule
    const emiSchedule = this.generateEMISchedule(
      principalAmount,
      monthlyEMI,
      interestRate,
      tenureMonths,
      loanStartDate,
      calculationMethod
    );
    
    // Calculate totals
    const totalInterest = emiSchedule.reduce((sum, item) => sum + item.interestComponent, 0);
    const totalAmount = principalAmount + totalInterest;
    const effectiveInterestRate = (totalInterest / principalAmount) * 100;
    
    return {
      monthlyEMI: Math.round(monthlyEMI * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      processingFee,
      emiSchedule,
      effectiveInterestRate: Math.round(effectiveInterestRate * 100) / 100
    };
  }
  
  /**
   * Generate detailed EMI schedule
   */
  private static generateEMISchedule(
    principal: number,
    emiAmount: number,
    annualRate: number,
    tenure: number,
    startDate: Date,
    method: 'reducing_balance' | 'simple_interest'
  ): EMIScheduleItem[] {
    const schedule: EMIScheduleItem[] = [];
    let remainingPrincipal = new Decimal(principal);
    const monthlyRate = new Decimal(annualRate).div(12).div(100);
    const emiDecimal = new Decimal(emiAmount);
    
    for (let i = 1; i <= tenure; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      let interestComponent: number;
      let principalComponent: number;
      
      if (method === 'reducing_balance') {
        // Interest on remaining principal
        interestComponent = remainingPrincipal.mul(monthlyRate).toNumber();
        principalComponent = emiDecimal.minus(interestComponent).toNumber();
      } else {
        // Simple interest - equal distribution
        const totalInterest = new Decimal(principal).mul(annualRate).div(100).mul(tenure).div(12);
        interestComponent = totalInterest.div(tenure).toNumber();
        principalComponent = emiDecimal.minus(interestComponent).toNumber();
      }
      
      // Ensure principal component doesn't exceed remaining balance
      if (principalComponent > remainingPrincipal.toNumber()) {
        principalComponent = remainingPrincipal.toNumber();
        interestComponent = emiDecimal.minus(principalComponent).toNumber();
      }
      
      remainingPrincipal = remainingPrincipal.minus(principalComponent);
      
      schedule.push({
        emiNumber: i,
        dueDate,
        emiAmount: Math.round(emiAmount * 100) / 100,
        principalComponent: Math.round(principalComponent * 100) / 100,
        interestComponent: Math.round(interestComponent * 100) / 100,
        remainingPrincipal: Math.round(Math.max(0, remainingPrincipal.toNumber()) * 100) / 100,
        status: 'pending'
      });
    }
    
    return schedule;
  }
  
  /**
   * Calculate penalty for overdue payments
   */
  public static calculatePenalty(
    overdueAmount: number,
    overdueDays: number,
    penaltyRate: number = 24, // Annual penalty rate
    gracePeriodDays: number = 7
  ): number {
    if (overdueDays <= gracePeriodDays) {
      return 0;
    }
    
    const applicableDays = overdueDays - gracePeriodDays;
    const dailyPenaltyRate = new Decimal(penaltyRate).div(365).div(100);
    const penalty = new Decimal(overdueAmount)
      .mul(dailyPenaltyRate)
      .mul(applicableDays);
    
    return Math.round(penalty.toNumber() * 100) / 100;
  }
  
  /**
   * Allocate payment across principal, interest, and penalty
   */
  public static allocatePayment(
    paymentAmount: number,
    outstandingPrincipal: number,
    outstandingInterest: number,
    penaltyAmount: number = 0,
    processingFeeOutstanding: number = 0
  ): PaymentAllocation {
    let remainingAmount = new Decimal(paymentAmount);
    
    // Payment allocation priority: Processing Fee > Penalty > Interest > Principal
    
    // 1. Processing Fee
    const processingFeePayment = Decimal.min(remainingAmount, processingFeeOutstanding);
    remainingAmount = remainingAmount.minus(processingFeePayment);
    
    // 2. Penalty
    const penaltyPayment = Decimal.min(remainingAmount, penaltyAmount);
    remainingAmount = remainingAmount.minus(penaltyPayment);
    
    // 3. Interest
    const interestPayment = Decimal.min(remainingAmount, outstandingInterest);
    remainingAmount = remainingAmount.minus(interestPayment);
    
    // 4. Principal
    const principalPayment = Decimal.min(remainingAmount, outstandingPrincipal);
    remainingAmount = remainingAmount.minus(principalPayment);
    
    return {
      processingFeePayment: Math.round(processingFeePayment.toNumber() * 100) / 100,
      penaltyPayment: Math.round(penaltyPayment.toNumber() * 100) / 100,
      interestPayment: Math.round(interestPayment.toNumber() * 100) / 100,
      principalPayment: Math.round(principalPayment.toNumber() * 100) / 100,
      remainingAmount: Math.round(remainingAmount.toNumber() * 100) / 100
    };
  }
  
  /**
   * Calculate current loan status and dues
   */
  public static calculateCurrentLoanStatus(
    loanDetails: {
      principalAmount: number;
      interestRate: number;
      tenureMonths: number;
      disbursementDate: Date;
      emiAmount: number;
    },
    payments: Array<{
      paymentDate: Date;
      principalPayment: number;
      interestPayment: number;
      penaltyPayment: number;
    }>
  ) {
    const { principalAmount, interestRate, tenureMonths, disbursementDate, emiAmount } = loanDetails;
    
    const currentDate = new Date();
    const monthsElapsed = this.calculateMonthsElapsed(disbursementDate, currentDate);
    
    // Calculate total payments made
    const totalPrincipalPaid = payments.reduce((sum, p) => sum + p.principalPayment, 0);
    const totalInterestPaid = payments.reduce((sum, p) => sum + p.interestPayment, 0);
    const totalPenaltyPaid = payments.reduce((sum, p) => sum + p.penaltyPayment, 0);
    
    // Calculate outstanding amounts
    const outstandingPrincipal = principalAmount - totalPrincipalPaid;
    
    // Calculate accrued interest
    const monthlyRate = interestRate / 12 / 100;
    let accruedInterest = 0;
    
    for (let month = 1; month <= Math.ceil(monthsElapsed); month++) {
      const monthStart = new Date(disbursementDate);
      monthStart.setMonth(monthStart.getMonth() + month - 1);
      
      const monthEnd = new Date(disbursementDate);
      monthEnd.setMonth(monthEnd.getMonth() + month);
      
      if (monthStart <= currentDate) {
        const endDate = monthEnd < currentDate ? monthEnd : currentDate;
        const daysInMonth = this.daysBetween(monthStart, endDate);
        
        const monthlyInterest = outstandingPrincipal * monthlyRate * (daysInMonth / 30);
        accruedInterest += monthlyInterest;
      }
    }
    
    const outstandingInterest = Math.max(0, accruedInterest - totalInterestPaid);
    
    // Calculate overdue amounts
    const expectedEMIs = Math.floor(monthsElapsed);
    const expectedPayment = expectedEMIs * emiAmount;
    const actualPayment = totalPrincipalPaid + totalInterestPaid;
    const overdueAmount = Math.max(0, expectedPayment - actualPayment);
    
    // Calculate penalty for overdue amount
    const overdueDays = this.calculateOverdueDays(disbursementDate, currentDate, payments);
    const penaltyAmount = overdueAmount > 0 ? this.calculatePenalty(overdueAmount, overdueDays) : 0;
    
    return {
      outstandingPrincipal: Math.round(outstandingPrincipal * 100) / 100,
      outstandingInterest: Math.round(outstandingInterest * 100) / 100,
      penaltyAmount: Math.round(penaltyAmount * 100) / 100,
      totalOutstanding: Math.round((outstandingPrincipal + outstandingInterest + penaltyAmount) * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      overdueDays,
      nextDueDate: this.calculateNextDueDate(disbursementDate, payments.length + 1),
      remainingTenure: Math.max(0, tenureMonths - payments.length)
    };
  }
  
  /**
   * Helper methods
   */
  private static calculateMonthsElapsed(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let months = (end.getFullYear() - start.getFullYear()) * 12;
    months -= start.getMonth();
    months += end.getMonth();
    
    if (end.getDate() < start.getDate()) {
      months--;
    }
    
    return Math.max(0, months);
  }
  
  private static daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  private static calculateOverdueDays(
    disbursementDate: Date,
    currentDate: Date,
    payments: Array<{ paymentDate: Date }>
  ): number {
    const lastPaymentDate = payments.length > 0 
      ? new Date(Math.max(...payments.map(p => p.paymentDate.getTime())))
      : disbursementDate;
    
    const nextDueDate = new Date(lastPaymentDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    if (currentDate > nextDueDate) {
      return this.daysBetween(nextDueDate, currentDate);
    }
    
    return 0;
  }
  
  private static calculateNextDueDate(disbursementDate: Date, nextEMINumber: number): Date {
    const nextDue = new Date(disbursementDate);
    nextDue.setMonth(nextDue.getMonth() + nextEMINumber);
    return nextDue;
  }
  
  /**
   * Loan-to-Value (LTV) ratio calculation
   */
  public static calculateLTV(loanAmount: number, goldValue: number): number {
    if (goldValue === 0) return 0;
    return Math.round((loanAmount / goldValue) * 100 * 100) / 100;
  }
  
  /**
   * Maximum loan amount based on gold value and LTV policy
   */
  public static calculateMaxLoanAmount(goldValue: number, maxLTVPercentage: number = 75): number {
    return Math.round((goldValue * maxLTVPercentage / 100) * 100) / 100;
  }
  
  /**
   * Interest rate calculation based on LTV and loan amount
   */
  public static calculateInterestRate(
    loanAmount: number,
    goldValue: number,
    baseLTVRate: number = 12,
    rateIncrementPerLTVPercent: number = 0.1
  ): number {
    const ltv = this.calculateLTV(loanAmount, goldValue);
    const additionalRate = Math.max(0, ltv - 70) * rateIncrementPerLTVPercent;
    return Math.round((baseLTVRate + additionalRate) * 100) / 100;
  }
}