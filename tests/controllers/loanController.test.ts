import request from 'supertest';
import app from '../../src/index';
import { PrismaClient } from '@prisma/client';
import {
  createMockUser,
  createMockLoanApplication,
  createMockActiveLoan,
  generateTestToken,
  createAuthHeaders,
  expectValidationError,
  expectSuccessResponse,
  expectNotFoundError,
  resetAllMocks
} from '../helpers/testHelpers';

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe('Loan Controller', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe('POST /api/v1/loans/applications', () => {
    const validLoanData = {
      loanAmount: 50000,
      loanPurpose: 'Business expansion',
      loanTenureMonths: 12,
      goldItems: [
        {
          type: 'jewelry',
          weight: 10,
          purity: 22,
          description: 'Gold necklace'
        }
      ],
      goldTotalWeight: 10,
      goldTotalValue: 60000,
      customerLocation: {
        address: '123 Test Street',
        city: 'Bangalore',
        pincode: '560001'
      },
      preferredVisitDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      preferredVisitTime: '10:00 AM',
      additionalNotes: 'Please call before visit'
    };

    it('should create loan application for authenticated user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication();

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.create as jest.Mock).mockResolvedValue(mockApplication);

      const response = await request(app)
        .post('/api/v1/loans/applications')
        .set(createAuthHeaders(token))
        .send(validLoanData);

      expectSuccessResponse(response);
      expect(response.body.data.application).toHaveProperty('applicationId');
      expect(response.body.data.application).toHaveProperty('applicationNumber');
      expect(response.body.data.application.requestedAmount).toBe(validLoanData.loanAmount);
    });

    it('should return validation error for missing required fields', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/loans/applications')
        .set(createAuthHeaders(token))
        .send({
          loanAmount: 50000
          // Missing other required fields
        });

      expectValidationError(response, 'loanPurpose');
    });

    it('should return validation error for invalid loan amount', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/loans/applications')
        .set(createAuthHeaders(token))
        .send({
          ...validLoanData,
          loanAmount: -1000 // Invalid amount
        });

      expectValidationError(response, 'loanAmount');
    });

    it('should return validation error for empty gold items', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/loans/applications')
        .set(createAuthHeaders(token))
        .send({
          ...validLoanData,
          goldItems: [] // Empty array
        });

      expectValidationError(response, 'goldItems');
    });

    it('should return error for unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/loans/applications')
        .send(validLoanData);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/loans/applications', () => {
    it('should get user loan applications', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplications = [createMockLoanApplication(), createMockLoanApplication()];

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findMany as jest.Mock).mockResolvedValue(mockApplications);
      (mockPrisma.loanApplication.count as jest.Mock).mockResolvedValue(2);

      const response = await request(app)
        .get('/api/v1/loans/applications')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.applications).toHaveLength(2);
      expect(response.body.data.pagination).toHaveProperty('total', 2);
    });

    it('should filter applications by status', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplications = [createMockLoanApplication({ applicationStatus: 'APPROVED' })];

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findMany as jest.Mock).mockResolvedValue(mockApplications);
      (mockPrisma.loanApplication.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/loans/applications?status=APPROVED')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.applications).toHaveLength(1);
      expect(response.body.data.applications[0].applicationStatus).toBe('APPROVED');
    });

    it('should handle pagination', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplications = [createMockLoanApplication()];

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findMany as jest.Mock).mockResolvedValue(mockApplications);
      (mockPrisma.loanApplication.count as jest.Mock).mockResolvedValue(10);

      const response = await request(app)
        .get('/api/v1/loans/applications?page=2&limit=5')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.pagination.total).toBe(10);
    });
  });

  describe('GET /api/v1/loans/applications/:applicationId', () => {
    it('should get application details for owner', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ customerId: mockUser.userId });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);

      const response = await request(app)
        .get(`/api/v1/loans/applications/${mockApplication.applicationId}`)
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.application.applicationId).toBe(mockApplication.applicationId);
    });

    it('should return not found for non-existent application', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/loans/applications/non-existent-id')
        .set(createAuthHeaders(token));

      expectNotFoundError(response);
    });

    it('should return forbidden for application not owned by user', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ customerId: 'different-user-id' });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);

      const response = await request(app)
        .get(`/api/v1/loans/applications/${mockApplication.applicationId}`)
        .set(createAuthHeaders(token));

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/loans/applications/:applicationId', () => {
    const updateData = {
      loanAmount: 75000,
      loanPurpose: 'Updated purpose',
      additionalNotes: 'Updated notes'
    };

    it('should update application in DRAFT status', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ 
        customerId: mockUser.userId,
        applicationStatus: 'DRAFT'
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);
      (mockPrisma.loanApplication.update as jest.Mock).mockResolvedValue({
        ...mockApplication,
        ...updateData
      });

      const response = await request(app)
        .put(`/api/v1/loans/applications/${mockApplication.applicationId}`)
        .set(createAuthHeaders(token))
        .send(updateData);

      expectSuccessResponse(response);
      expect(response.body.data.application.requestedAmount).toBe(updateData.loanAmount);
    });

    it('should return error for updating submitted application', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ 
        customerId: mockUser.userId,
        applicationStatus: 'SUBMITTED'
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);

      const response = await request(app)
        .put(`/api/v1/loans/applications/${mockApplication.applicationId}`)
        .set(createAuthHeaders(token))
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('APPLICATION_NOT_EDITABLE');
    });
  });

  describe('POST /api/v1/loans/applications/:applicationId/submit', () => {
    it('should submit application for review', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ 
        customerId: mockUser.userId,
        applicationStatus: 'DRAFT'
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);
      (mockPrisma.loanApplication.update as jest.Mock).mockResolvedValue({
        ...mockApplication,
        applicationStatus: 'SUBMITTED',
        submittedAt: new Date()
      });

      const response = await request(app)
        .post(`/api/v1/loans/applications/${mockApplication.applicationId}/submit`)
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.application.applicationStatus).toBe('SUBMITTED');
    });

    it('should return error for already submitted application', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockApplication = createMockLoanApplication({ 
        customerId: mockUser.userId,
        applicationStatus: 'SUBMITTED'
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.loanApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);

      const response = await request(app)
        .post(`/api/v1/loans/applications/${mockApplication.applicationId}/submit`)
        .set(createAuthHeaders(token));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('APPLICATION_ALREADY_SUBMITTED');
    });
  });

  describe('POST /api/v1/loans/calculate-eligibility', () => {
    const eligibilityData = {
      goldWeight: 10,
      goldPurity: 22,
      currentGoldRate: 6200
    };

    it('should calculate loan eligibility', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/loans/calculate-eligibility')
        .set(createAuthHeaders(token))
        .send(eligibilityData);

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('maxLoanAmount');
      expect(response.body.data).toHaveProperty('goldValue');
      expect(response.body.data).toHaveProperty('loanToValueRatio');
    });

    it('should return validation error for invalid data', async () => {
      const token = generateTestToken();

      const response = await request(app)
        .post('/api/v1/loans/calculate-eligibility')
        .set(createAuthHeaders(token))
        .send({
          goldWeight: -5, // Invalid
          goldPurity: 25, // Invalid (max 24)
          currentGoldRate: 0 // Invalid
        });

      expectValidationError(response, 'goldWeight');
    });
  });

  describe('GET /api/v1/loans/active', () => {
    it('should get user active loans', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockLoans = [createMockActiveLoan({ customerId: mockUser.userId })];

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.activeLoan.findMany as jest.Mock).mockResolvedValue(mockLoans);

      const response = await request(app)
        .get('/api/v1/loans/active')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.activeLoans).toHaveLength(1);
      expect(response.body.data.activeLoans[0].customerId).toBe(mockUser.userId);
    });

    it('should return empty array for user with no active loans', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.activeLoan.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/loans/active')
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.activeLoans).toHaveLength(0);
    });
  });

  describe('GET /api/v1/loans/active/:loanId', () => {
    it('should get loan details for owner', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();
      const mockLoan = createMockActiveLoan({ customerId: mockUser.userId });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.activeLoan.findUnique as jest.Mock).mockResolvedValue(mockLoan);

      const response = await request(app)
        .get(`/api/v1/loans/active/${mockLoan.loanId}`)
        .set(createAuthHeaders(token));

      expectSuccessResponse(response);
      expect(response.body.data.loan.loanId).toBe(mockLoan.loanId);
    });

    it('should return not found for non-existent loan', async () => {
      const token = generateTestToken();
      const mockUser = createMockUser();

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (mockPrisma.activeLoan.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/loans/active/non-existent-id')
        .set(createAuthHeaders(token));

      expectNotFoundError(response);
    });
  });

  describe('GET /api/v1/loans/gold-rates', () => {
    it('should get current gold rates', async () => {
      const response = await request(app)
        .get('/api/v1/loans/gold-rates');

      expectSuccessResponse(response);
      expect(response.body.data).toHaveProperty('goldRates');
      expect(response.body.data.goldRates).toHaveProperty('24K');
      expect(response.body.data.goldRates).toHaveProperty('22K');
      expect(response.body.data.goldRates).toHaveProperty('18K');
    });
  });
});