import swaggerJSDoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'GPT Gold Loan API',
    version: '1.0.0',
    description: 'Comprehensive API for Gold Loan Management System with doorstep services',
    contact: {
      name: 'Development Team',
      email: 'dev@goldloan.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: process.env.API_BASE_URL || 'http://localhost:3000',
      description: 'Development server',
    },
    {
      url: 'https://api.goldloan.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          phone_number: { type: 'string' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          user_type: { 
            type: 'string', 
            enum: ['customer', 'employee', 'admin', 'super_admin'] 
          },
          status: { 
            type: 'string', 
            enum: ['active', 'inactive', 'suspended'] 
          },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      LoanApplication: {
        type: 'object',
        properties: {
          application_id: { type: 'string', format: 'uuid' },
          customer_id: { type: 'string', format: 'uuid' },
          application_number: { type: 'string' },
          requested_amount: { type: 'number', format: 'decimal' },
          loan_purpose: { type: 'string' },
          application_status: { 
            type: 'string', 
            enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled'] 
          },
          gold_items: { type: 'object' },
          total_weight: { type: 'number', format: 'decimal' },
          estimated_value: { type: 'number', format: 'decimal' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          payment_id: { type: 'string', format: 'uuid' },
          loan_id: { type: 'string', format: 'uuid' },
          payment_amount: { type: 'number', format: 'decimal' },
          payment_method: { 
            type: 'string', 
            enum: ['cash', 'upi', 'card', 'bank_transfer', 'wallet'] 
          },
          payment_status: { 
            type: 'string', 
            enum: ['pending', 'completed', 'failed', 'refunded'] 
          },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      QRSession: {
        type: 'object',
        properties: {
          qr_session_id: { type: 'string', format: 'uuid' },
          customer_id: { type: 'string', format: 'uuid' },
          qr_token: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
          session_status: { 
            type: 'string', 
            enum: ['active', 'used', 'expired', 'revoked'] 
          },
          location: {
            type: 'object',
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          status: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './dist/routes/*.js',
    './dist/controllers/*.js',
  ],
};

export const swaggerSpec = swaggerJSDoc(options);