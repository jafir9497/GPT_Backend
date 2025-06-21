import { Request } from 'express';

export interface JWTPayload {
  userId: string;
  phoneNumber: string;
  userType: string;
}

export interface AuthRequest extends Request {
  user?: JWTPayload & {
    iat: number;
    exp: number;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & {
        iat: number;
        exp: number;
      };
      biometricData?: {
        deviceId: string;
        biometricTemplate: string;
        timestamp: string;
        location?: string;
      };
    }
  }
}