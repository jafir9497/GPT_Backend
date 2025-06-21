import * as jwt from 'jsonwebtoken';
import { JWTPayload } from '../types/express';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTService {
  // Generate access token
  static generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(
      payload,
      process.env.JWT_SECRET!,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '2h',
        issuer: 'gpt-gold-loan-api',
        audience: 'gpt-gold-loan-app',
      } as jwt.SignOptions
    );
  }

  // Generate refresh token
  static generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        issuer: 'gpt-gold-loan-api',
        audience: 'gpt-gold-loan-app',
      } as jwt.SignOptions
    );
  }

  // Generate both tokens
  static generateTokenPair(payload: JWTPayload): TokenPair {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
    };
  }

  // Verify token
  static verifyToken(token: string, secret: string): JWTPayload {
    return jwt.verify(token, secret) as JWTPayload;
  }

  // Decode token without verification (for debugging)
  static decodeToken(token: string): any {
    return jwt.decode(token);
  }

  // Get token expiration time
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Check if token is expired
  static isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) return true;
    return expiration < new Date();
  }

  // Generate QR token (short-lived for doorstep verification)
  static generateQRToken(payload: { customerId: string; location?: string | undefined }): string {
    return jwt.sign(
      payload,
      process.env.JWT_SECRET!,
      {
        expiresIn: '30s', // QR codes expire in 30 seconds
        issuer: 'gpt-gold-loan-api',
        audience: 'gpt-gold-loan-qr',
      } as jwt.SignOptions
    );
  }

  // Verify QR token
  static verifyQRToken(token: string): { customerId: string; location?: string | undefined } {
    return jwt.verify(token, process.env.JWT_SECRET!) as { customerId: string; location?: string };
  }
}