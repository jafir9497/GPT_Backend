import { GoldPurity as PrismaGoldPurity } from '@prisma/client';

export { GoldPurity } from '@prisma/client';

export interface GoldRate {
  id: number;
  purity: PrismaGoldPurity;
  ratePerGram: number;
  updatedAt: Date;
}

export interface InterestSchemeRate {
  id: number;
  schemeLabel: string;
  interestRate: number;
  purity: PrismaGoldPurity;
  ratePerGram: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoanCalculationByAmount {
  loanAmount: number;
  purity: PrismaGoldPurity;
  interestRate: number;
}

export interface LoanCalculationByWeight {
  goldWeight: number;
  purity: PrismaGoldPurity;
  interestRate: number;
}

export interface LoanCalculationResult {
  purity: string;
  interestRate: number;
  principalAmount: number;
  interestAmount: number;
  eligibleAmount: number;
  goldWeight?: number;
  loanAmount?: number;
  ratePerGram?: number;
}

export interface CreateGoldRateRequest {
  purity: PrismaGoldPurity;
  ratePerGram: number;
}

export interface CreateInterestSchemeRateRequest {
  schemeLabel: string;
  interestRate: number;
  purity: PrismaGoldPurity;
  ratePerGram: number;
}

export const GOLD_PURITY_LABELS = {
  TWENTYFOUR_K: '24K (99.9% Pure)',
  TWENTYTWO_K: '22K (91.6% Pure)', 
  EIGHTEEN_K: '18K (75% Pure)',
  MIXED: 'Mixed'
} as const;

export const DEFAULT_INTEREST_SCHEMES = [
  { id: 1, rate: 0.5, label: '0.5% Interest' },
  { id: 2, rate: 1.0, label: '1.0% Interest' },
  { id: 3, rate: 1.5, label: '1.5% Interest' },
  { id: 4, rate: 2.0, label: '2.0% Interest' },
] as const;