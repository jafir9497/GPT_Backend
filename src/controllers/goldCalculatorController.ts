import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { 
  LoanCalculationByAmount, 
  LoanCalculationByWeight, 
  LoanCalculationResult,
  CreateGoldRateRequest,
  CreateInterestSchemeRateRequest,
  GoldPurity
} from '../models/goldCalculator.types';

const prisma = new PrismaClient();

export class GoldCalculatorController {
  // Calculate loan by amount (returns required gold weight)
  static async calculateByAmount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { loanAmount, purity, interestRate }: LoanCalculationByAmount = req.body;

      // Validation
      if (!loanAmount || loanAmount <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Loan amount must be positive' }
        });
        return;
      }

      if (!['TWENTYFOUR_K', 'TWENTYTWO_K', 'EIGHTEEN_K', 'MIXED'].includes(purity)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid gold purity' }
        });
        return;
      }

      if (!interestRate || interestRate <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Interest rate must be positive' }
        });
        return;
      }

      // Get interest scheme rate for the selected purity and interest rate
      const schemeRate = await prisma.interestSchemeRate.findFirst({
        where: {
          purity,
          interestRate
        }
      });

      if (!schemeRate) {
        res.status(404).json({
          success: false,
          error: { 
            message: `Interest scheme rate for ${purity} at ${interestRate}% not found` 
          }
        });
        return;
      }

      // Calculate loan details
      const interestAmount = loanAmount * (interestRate / 100);
      const eligibleAmount = loanAmount - interestAmount;

      // Use the rate per gram from the scheme
      const baseWeight = loanAmount / Number(schemeRate.ratePerGram);

      // Adjustment factor - For lower interest rates, increase required gold weight
      // If interest rate is 2%, multiplier is 1.0
      // If interest rate is 0.5%, multiplier is around 1.25
      const interestAdjustmentFactor = 1 + (2 - interestRate) / 8;
      const goldWeight = baseWeight * interestAdjustmentFactor;

      const result: LoanCalculationResult = {
        purity,
        interestRate,
        principalAmount: loanAmount,
        interestAmount,
        eligibleAmount,
        goldWeight,
        ratePerGram: Number(schemeRate.ratePerGram),
      };

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating loan by amount:', error);
      next(error);
    }
  }

  // Calculate loan by weight (returns eligible loan amount)
  static async calculateByWeight(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { goldWeight, purity, interestRate }: LoanCalculationByWeight = req.body;

      // Validation
      if (!goldWeight || goldWeight <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Gold weight must be positive' }
        });
        return;
      }

      if (!['TWENTYFOUR_K', 'TWENTYTWO_K', 'EIGHTEEN_K', 'MIXED'].includes(purity)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid gold purity' }
        });
        return;
      }

      if (!interestRate || interestRate <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Interest rate must be positive' }
        });
        return;
      }

      // Get interest scheme rate for the selected purity and interest rate
      const schemeRate = await prisma.interestSchemeRate.findFirst({
        where: {
          purity,
          interestRate
        }
      });

      if (!schemeRate) {
        res.status(404).json({
          success: false,
          error: { 
            message: `Interest scheme rate for ${purity} at ${interestRate}% not found` 
          }
        });
        return;
      }

      // Calculate loan details (FIXED: removed adjustment factor)
      const loanAmount = goldWeight * Number(schemeRate.ratePerGram);
      const interestAmount = loanAmount * (interestRate / 100);
      const eligibleAmount = loanAmount - interestAmount;

      const result: LoanCalculationResult = {
        purity,
        interestRate,
        principalAmount: loanAmount,
        interestAmount,
        eligibleAmount,
        loanAmount,
        ratePerGram: Number(schemeRate.ratePerGram),
      };

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error calculating loan by weight:', error);
      next(error);
    }
  }

  // Get current gold rates
  static async getGoldRates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const goldRates = await prisma.goldRate.findMany({
        orderBy: { updatedAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: goldRates
      });
    } catch (error) {
      console.error('Error fetching gold rates:', error);
      next(error);
    }
  }

  // Update gold rate (admin only)
  static async updateGoldRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { purity, ratePerGram }: CreateGoldRateRequest = req.body;

      // Validation
      if (!['TWENTYFOUR_K', 'TWENTYTWO_K', 'EIGHTEEN_K', 'MIXED'].includes(purity)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid gold purity' }
        });
        return;
      }

      if (!ratePerGram || ratePerGram <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Rate per gram must be positive' }
        });
        return;
      }

      // Check if rate exists for this purity
      const existingRate = await prisma.goldRate.findFirst({
        where: { purity }
      });

      let goldRate;
      if (existingRate) {
        // Update existing rate
        goldRate = await prisma.goldRate.update({
          where: { id: existingRate.id },
          data: {
            ratePerGram,
            updatedAt: new Date()
          }
        });
        return;
      } else {
        // Create new rate
        goldRate = await prisma.goldRate.create({
          data: {
            purity: purity as GoldPurity,
            ratePerGram,
            updatedAt: new Date()
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: goldRate
      });
    } catch (error) {
      console.error('Error updating gold rate:', error);
      next(error);
    }
  }

  // Get all interest scheme rates
  static async getInterestSchemeRates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schemes = await prisma.interestSchemeRate.findMany({
        orderBy: [
          { purity: 'asc' },
          { interestRate: 'asc' }
        ]
      });

      res.status(200).json({
        success: true,
        data: schemes
      });
    } catch (error) {
      console.error('Error fetching interest scheme rates:', error);
      next(error);
    }
  }

  // Create interest scheme rate (admin only)
  static async createInterestSchemeRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { schemeLabel, interestRate, purity, ratePerGram }: CreateInterestSchemeRateRequest = req.body;

      // Validation
      if (!schemeLabel || schemeLabel.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Scheme label is required' }
        });
        return;
      }

      if (!interestRate || interestRate <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Interest rate must be positive' }
        });
        return;
      }

      if (!['TWENTYFOUR_K', 'TWENTYTWO_K', 'EIGHTEEN_K', 'MIXED'].includes(purity)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid gold purity' }
        });
        return;
      }

      if (!ratePerGram || ratePerGram <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Rate per gram must be positive' }
        });
        return;
      }

      // Check if scheme already exists for this purity and interest rate
      const existingScheme = await prisma.interestSchemeRate.findFirst({
        where: {
          purity,
          interestRate
        }
      });

      if (existingScheme) {
        res.status(400).json({
          success: false,
          error: { message: 'Interest scheme already exists for this purity and rate' }
        });
        return;
      }

      const scheme = await prisma.interestSchemeRate.create({
        data: {
          schemeLabel,
          interestRate,
          purity: purity as GoldPurity,
          ratePerGram,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      res.status(201).json({
        success: true,
        data: scheme
      });
    } catch (error) {
      console.error('Error creating interest scheme rate:', error);
      next(error);
    }
  }

  // Update interest scheme rate (admin only)
  static async updateInterestSchemeRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { schemeLabel, interestRate, purity, ratePerGram }: CreateInterestSchemeRateRequest = req.body;

      // Validation
      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'Valid scheme ID is required' }
        });
        return;
      }

      if (!schemeLabel || schemeLabel.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Scheme label is required' }
        });
        return;
      }

      if (!interestRate || interestRate <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Interest rate must be positive' }
        });
        return;
      }

      if (!['TWENTYFOUR_K', 'TWENTYTWO_K', 'EIGHTEEN_K', 'MIXED'].includes(purity)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid gold purity' }
        });
        return;
      }

      if (!ratePerGram || ratePerGram <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Rate per gram must be positive' }
        });
        return;
      }

      // Check if scheme exists
      const existingScheme = await prisma.interestSchemeRate.findUnique({
        where: { id: parseInt(id) }
      });

      if (!existingScheme) {
        res.status(404).json({
          success: false,
          error: { message: 'Interest scheme not found' }
        });
        return;
      }

      // Check if another scheme with same purity and rate exists (excluding current one)
      const duplicateScheme = await prisma.interestSchemeRate.findFirst({
        where: {
          purity: purity as GoldPurity,
          interestRate,
          id: { not: parseInt(id) }
        }
      });

      if (duplicateScheme) {
        res.status(400).json({
          success: false,
          error: { message: 'Another scheme already exists for this purity and rate' }
        });
        return;
      }

      const updatedScheme = await prisma.interestSchemeRate.update({
        where: { id: parseInt(id) },
        data: {
          schemeLabel,
          interestRate,
          purity: purity as GoldPurity,
          ratePerGram,
          updatedAt: new Date()
        }
      });

      res.status(200).json({
        success: true,
        data: updatedScheme
      });
    } catch (error) {
      console.error('Error updating interest scheme rate:', error);
      next(error);
    }
  }

  // Delete interest scheme rate (admin only)
  static async deleteInterestSchemeRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      // Validation
      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'Valid scheme ID is required' }
        });
        return;
      }

      // Check if scheme exists
      const existingScheme = await prisma.interestSchemeRate.findUnique({
        where: { id: parseInt(id) }
      });

      if (!existingScheme) {
        res.status(404).json({
          success: false,
          error: { message: 'Interest scheme not found' }
        });
        return;
      }

      await prisma.interestSchemeRate.delete({
        where: { id: parseInt(id) }
      });

      res.status(200).json({
        success: true,
        message: 'Interest scheme deleted successfully',
        data: { deletedId: parseInt(id) }
      });
    } catch (error) {
      console.error('Error deleting interest scheme rate:', error);
      next(error);
    }
  }

  // Get single interest scheme rate by ID
  static async getInterestSchemeRateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      // Validation
      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'Valid scheme ID is required' }
        });
        return;
      }

      const scheme = await prisma.interestSchemeRate.findUnique({
        where: { id: parseInt(id) }
      });

      if (!scheme) {
        res.status(404).json({
          success: false,
          error: { message: 'Interest scheme not found' }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: scheme
      });
    } catch (error) {
      console.error('Error fetching interest scheme rate:', error);
      next(error);
    }
  }

  // Initialize default data
  static async initializeDefaultData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Initialize default gold rates
      const defaultGoldRates = [
        { purity: 'TWENTYFOUR_K' as GoldPurity, ratePerGram: 6250 },
        { purity: 'TWENTYTWO_K' as GoldPurity, ratePerGram: 5750 },
        { purity: 'EIGHTEEN_K' as GoldPurity, ratePerGram: 4650 },
        { purity: 'MIXED' as GoldPurity, ratePerGram: 4200 },
      ];

      for (const rate of defaultGoldRates) {
        const existing = await prisma.goldRate.findFirst({
          where: { purity: rate.purity }
        });

        if (!existing) {
          await prisma.goldRate.create({
            data: {
              purity: rate.purity as GoldPurity,
              ratePerGram: rate.ratePerGram,
              updatedAt: new Date()
            }
          });
        }
      }

      // Initialize default interest scheme rates
      const defaultSchemes = [
        { purity: 'TWENTYFOUR_K', interestRate: 0.5, ratePerGram: 6200, label: '0.5% Premium 24K' },
        { purity: 'TWENTYFOUR_K', interestRate: 1.0, ratePerGram: 6150, label: '1.0% Standard 24K' },
        { purity: 'TWENTYFOUR_K', interestRate: 1.5, ratePerGram: 6100, label: '1.5% Economy 24K' },
        { purity: 'TWENTYFOUR_K', interestRate: 2.0, ratePerGram: 6050, label: '2.0% Basic 24K' },
        
        { purity: 'TWENTYTWO_K', interestRate: 0.5, ratePerGram: 5700, label: '0.5% Premium 22K' },
        { purity: 'TWENTYTWO_K', interestRate: 1.0, ratePerGram: 5650, label: '1.0% Standard 22K' },
        { purity: 'TWENTYTWO_K', interestRate: 1.5, ratePerGram: 5600, label: '1.5% Economy 22K' },
        { purity: 'TWENTYTWO_K', interestRate: 2.0, ratePerGram: 5550, label: '2.0% Basic 22K' },
        
        { purity: 'EIGHTEEN_K', interestRate: 0.5, ratePerGram: 4600, label: '0.5% Premium 18K' },
        { purity: 'EIGHTEEN_K', interestRate: 1.0, ratePerGram: 4550, label: '1.0% Standard 18K' },
        { purity: 'EIGHTEEN_K', interestRate: 1.5, ratePerGram: 4500, label: '1.5% Economy 18K' },
        { purity: 'EIGHTEEN_K', interestRate: 2.0, ratePerGram: 4450, label: '2.0% Basic 18K' },
        
        { purity: 'MIXED', interestRate: 0.5, ratePerGram: 4150, label: '0.5% Premium Mixed' },
        { purity: 'MIXED', interestRate: 1.0, ratePerGram: 4100, label: '1.0% Standard Mixed' },
        { purity: 'MIXED', interestRate: 1.5, ratePerGram: 4050, label: '1.5% Economy Mixed' },
        { purity: 'MIXED', interestRate: 2.0, ratePerGram: 4000, label: '2.0% Basic Mixed' },
      ];

      for (const scheme of defaultSchemes) {
        const existing = await prisma.interestSchemeRate.findFirst({
          where: {
            purity: scheme.purity as GoldPurity,
            interestRate: scheme.interestRate
          }
        });

        if (!existing) {
          await prisma.interestSchemeRate.create({
            data: {
              schemeLabel: scheme.label,
              interestRate: scheme.interestRate,
              purity: scheme.purity as GoldPurity,
              ratePerGram: scheme.ratePerGram,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Default gold calculator data initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing default data:', error);
      next(error);
    }
  }
}