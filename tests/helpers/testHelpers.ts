import jwt from 'jsonwebtoken';
import { UserType } from '@prisma/client';

// Test data factories
export const createMockUser = (overrides = {}) => ({
  userId: 'test-user-id',
  phoneNumber: '+919876543210',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  userType: UserType.CUSTOMER,
  status: 'ACTIVE',
  biometricEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockEmployee = (overrides = {}) => ({
  ...createMockUser({
    userType: UserType.EMPLOYEE,
    ...overrides
  }),
  employeeDetails: {
    employeeId: 'EMP001',
    department: 'Operations',
    designation: 'Field Agent',
    ...overrides.employeeDetails
  }
});

export const createMockAdmin = (overrides = {}) => ({
  ...createMockUser({
    userType: UserType.ADMIN,
    ...overrides
  })
});

export const createMockLoanApplication = (overrides = {}) => ({
  applicationId: 'test-app-id',
  customerId: 'test-user-id',
  applicationNumber: 'GLN123456789',
  requestedAmount: 50000,
  loanPurpose: 'Business expansion',
  applicationStatus: 'DRAFT',
  goldItems: JSON.stringify([
    {
      type: 'jewelry',
      weight: 10,
      purity: 22,
      description: 'Gold necklace'
    }
  ]),
  totalWeight: 10,
  estimatedValue: 60000,
  createdBy: 'test-user-id',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockActiveLoan = (overrides = {}) => ({
  loanId: 'test-loan-id',
  applicationId: 'test-app-id',
  customerId: 'test-user-id',
  loanNumber: 'LOAN123456789',
  principalAmount: 50000,
  interestRate: 12.5,
  loanTenureMonths: 12,
  loanStartDate: new Date(),
  loanEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  loanStatus: 'ACTIVE',
  outstandingPrincipal: 50000,
  accruedInterest: 0,
  totalOutstanding: 50000,
  emiAmount: 4500,
  nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockPayment = (overrides = {}) => ({
  paymentId: 'test-payment-id',
  loanId: 'test-loan-id',
  paymentNumber: 'PAY123456789',
  paymentAmount: 4500,
  paymentDate: new Date(),
  paymentMethod: 'UPI',
  paymentStatus: 'COMPLETED',
  principalPayment: 4000,
  interestPayment: 500,
  penaltyPayment: 0,
  chargesPayment: 0,
  receiptNumber: 'RCP123456789',
  verificationStatus: 'VERIFIED',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockDocument = (overrides = {}) => ({
  documentId: 'test-doc-id',
  customerId: 'test-user-id',
  documentType: 'STATEMENT',
  title: 'Loan Statement',
  fileName: 'statement.pdf',
  filePath: '/documents/statement.pdf',
  fileSize: BigInt(1024),
  mimeType: 'application/pdf',
  generatedAt: new Date(),
  createdBy: 'test-user-id',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockQRSession = (overrides = {}) => ({
  qrSessionId: 'test-qr-id',
  customerId: 'test-user-id',
  qrToken: 'test-qr-token',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  location: '12.9716,77.5946',
  sessionStatus: 'ACTIVE',
  createdAt: new Date(),
  ...overrides
});

export const createMockNotification = (overrides = {}) => ({
  notificationId: 'test-notification-id',
  userId: 'test-user-id',
  type: 'loan_status',
  title: 'Loan Status Update',
  message: 'Your loan application has been approved',
  data: {},
  priority: 'medium',
  actionRequired: false,
  readAt: null,
  createdAt: new Date(),
  ...overrides
});

// JWT token helpers
export const generateTestToken = (payload: any = {}) => {
  const defaultPayload = {
    userId: 'test-user-id',
    role: UserType.CUSTOMER,
    phoneNumber: '+919876543210'
  };
  
  return jwt.sign(
    { ...defaultPayload, ...payload },
    process.env.JWT_SECRET || 'test-jwt-secret-key',
    { expiresIn: '1h' }
  );
};

export const generateEmployeeToken = (overrides = {}) => {
  return generateTestToken({
    userId: 'test-employee-id',
    role: UserType.EMPLOYEE,
    ...overrides
  });
};

export const generateAdminToken = (overrides = {}) => {
  return generateTestToken({
    userId: 'test-admin-id',
    role: UserType.ADMIN,
    ...overrides
  });
};

// Request helpers
export const createAuthHeaders = (token?: string) => ({
  'Authorization': `Bearer ${token || generateTestToken()}`,
  'Content-Type': 'application/json'
});

export const createEmployeeAuthHeaders = (token?: string) => ({
  'Authorization': `Bearer ${token || generateEmployeeToken()}`,
  'Content-Type': 'application/json'
});

export const createAdminAuthHeaders = (token?: string) => ({
  'Authorization': `Bearer ${token || generateAdminToken()}`,
  'Content-Type': 'application/json'
});

// Mock response helpers
export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

export const createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ip: '127.0.0.1',
  get: jest.fn(),
  ...overrides
});

// Date helpers
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

// Validation helpers
export const expectValidationError = (response: any, field: string) => {
  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe('VALIDATION_ERROR');
};

export const expectAuthError = (response: any) => {
  expect(response.status).toBe(401);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe('UNAUTHORIZED');
};

export const expectForbiddenError = (response: any) => {
  expect(response.status).toBe(403);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe('FORBIDDEN');
};

export const expectNotFoundError = (response: any) => {
  expect(response.status).toBe(404);
  expect(response.body.success).toBe(false);
};

export const expectSuccessResponse = (response: any, expectedData?: any) => {
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  if (expectedData) {
    expect(response.body.data).toMatchObject(expectedData);
  }
};

// Mock implementations for common scenarios
export const mockPrismaUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

export const mockPrismaLoanApplication = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

export const mockPrismaActiveLoan = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
};

// Reset all mocks
export const resetAllMocks = () => {
  jest.clearAllMocks();
  mockPrismaUser.findUnique.mockReset();
  mockPrismaUser.findFirst.mockReset();
  mockPrismaUser.findMany.mockReset();
  mockPrismaUser.create.mockReset();
  mockPrismaUser.update.mockReset();
  mockPrismaUser.delete.mockReset();
  mockPrismaUser.count.mockReset();
  
  mockPrismaLoanApplication.findUnique.mockReset();
  mockPrismaLoanApplication.findFirst.mockReset();
  mockPrismaLoanApplication.findMany.mockReset();
  mockPrismaLoanApplication.create.mockReset();
  mockPrismaLoanApplication.update.mockReset();
  mockPrismaLoanApplication.delete.mockReset();
  mockPrismaLoanApplication.count.mockReset();
  
  mockPrismaActiveLoan.findUnique.mockReset();
  mockPrismaActiveLoan.findFirst.mockReset();
  mockPrismaActiveLoan.findMany.mockReset();
  mockPrismaActiveLoan.create.mockReset();
  mockPrismaActiveLoan.update.mockReset();
  mockPrismaActiveLoan.delete.mockReset();
  mockPrismaActiveLoan.count.mockReset();
  mockPrismaActiveLoan.aggregate.mockReset();
};