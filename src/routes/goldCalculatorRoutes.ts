import { Router } from 'express';
import { GoldCalculatorController } from '../controllers/goldCalculatorController';

const router = Router();

// Calculation endpoints
router.post('/calculate/by-amount', GoldCalculatorController.calculateByAmount);
router.post('/calculate/by-weight', GoldCalculatorController.calculateByWeight);

// Gold rates endpoints
router.get('/rates', GoldCalculatorController.getGoldRates);
router.post('/rates', GoldCalculatorController.updateGoldRate);

// Interest scheme endpoints
router.get('/schemes', GoldCalculatorController.getInterestSchemeRates);
router.get('/schemes/:id', GoldCalculatorController.getInterestSchemeRateById);
router.post('/schemes', GoldCalculatorController.createInterestSchemeRate);
router.put('/schemes/:id', GoldCalculatorController.updateInterestSchemeRate);
router.delete('/schemes/:id', GoldCalculatorController.deleteInterestSchemeRate);

// Initialize default data (admin only)
router.post('/initialize', GoldCalculatorController.initializeDefaultData);

export default router;