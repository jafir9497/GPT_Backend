import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';
import { logger } from '../utils/logger';
import { JWTPayload } from '../types/express';

export class AuthMiddleware {
  // Verify JWT token
  static verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        throw createError('Authorization header is required', 401);
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;

      if (!token) {
        throw createError('Access token is required', 401);
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { iat: number; exp: number };
      
      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn(`Invalid token: ${error.message}`);
        void res.status(401).json({
          success: false,
          error: {
            message: 'Invalid access token',
          },
        });
        return;
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn(`Token expired: ${error.message}`);
        void res.status(401).json({
          success: false,
          error: {
            message: 'Access token has expired',
          },
        });
        return;
      }

      next(error);
    }
  };

  // Verify refresh token
  static verifyRefreshToken = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw createError('Refresh token is required', 401);
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as JWTPayload & { iat: number; exp: number };
      
      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn(`Invalid refresh token: ${error.message}`);
        void res.status(401).json({
          success: false,
          error: {
            message: 'Invalid refresh token',
          },
        });
        return;
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn(`Refresh token expired: ${error.message}`);
        void res.status(401).json({
          success: false,
          error: {
            message: 'Refresh token has expired',
          },
        });
        return;
      }

      next(error);
    }
  };

  // Role-based access control
  static requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        void res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required',
          },
        });
        return;
      }

      if (!allowedRoles.includes(req.user.userType)) {
        logger.warn(`Access denied for user ${req.user.userId} with role ${req.user.userType}`);
        void res.status(403).json({
          success: false,
          error: {
            message: 'Insufficient permissions',
          },
        });
        return;
      }

      next();
    };
  };

  // Customer-only access
  static requireCustomer = AuthMiddleware.requireRole(['CUSTOMER']);

  // Employee access (includes field agents, admins, super admins)
  static requireEmployee = AuthMiddleware.requireRole(['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN']);

  // Admin access (includes admins and super admins)
  static requireAdmin = AuthMiddleware.requireRole(['ADMIN', 'SUPER_ADMIN']);

  // Super admin only access
  static requireSuperAdmin = AuthMiddleware.requireRole(['SUPER_ADMIN']);

  // Optional authentication (user info if token provided, but not required)
  static optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        next();
        return;
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : authHeader;

      if (!token) {
        next();
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { iat: number; exp: number };
      req.user = decoded;
      
      next();
    } catch (error) {
      // For optional auth, we don't throw errors for invalid tokens
      logger.debug(`Optional auth failed: ${error}`);
      next();
    }
  };
}

// Export convenience functions for backward compatibility
export const authenticateToken = AuthMiddleware.verifyToken;
export const verifyRefreshToken = AuthMiddleware.verifyRefreshToken;
export const requireRole = AuthMiddleware.requireRole;
export const requireCustomer = AuthMiddleware.requireCustomer;
export const requireEmployee = AuthMiddleware.requireEmployee;
export const requireAdmin = AuthMiddleware.requireAdmin;
export const requireSuperAdmin = AuthMiddleware.requireSuperAdmin;
export const optionalAuth = AuthMiddleware.optionalAuth;