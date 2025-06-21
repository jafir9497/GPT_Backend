import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';
import { logger } from '../utils/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = (req: Request) => `cache:${req.method}:${req.originalUrl}`,
    condition = () => true
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests by default
    if (req.method !== 'GET' || !condition(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return res.json(cachedData);
      }

      logger.debug(`Cache miss for key: ${cacheKey}`);

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache the response
      res.json = function(data: any) {
        // Cache the response data
        if (res.statusCode === 200 && data) {
          cacheService.set(cacheKey, data, ttl).catch(error => {
            logger.error(`Failed to cache data for key ${cacheKey}:`, error);
          });
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error(`Cache middleware error for key ${cacheKey}:`, error);
      next();
    }
  };
};

// Specific cache middleware for different routes
export const userCacheMiddleware = cacheMiddleware({
  ttl: 600, // 10 minutes
  keyGenerator: (req: Request) => {
    const userId = req.params.userId || req.user?.userId;
    return `user:${userId}:profile`;
  },
  condition: (req: Request) => !!req.user
});

export const loanCacheMiddleware = cacheMiddleware({
  ttl: 300, // 5 minutes
  keyGenerator: (req: Request) => {
    const loanId = req.params.loanId || req.params.id;
    return `loan:${loanId}:details`;
  }
});

export const paymentCacheMiddleware = cacheMiddleware({
  ttl: 180, // 3 minutes
  keyGenerator: (req: Request) => {
    const paymentId = req.params.paymentId || req.params.id;
    return `payment:${paymentId}:details`;
  }
});

export const statsCacheMiddleware = cacheMiddleware({
  ttl: 900, // 15 minutes
  keyGenerator: (req: Request) => {
    const { period = 'daily', type = 'general' } = req.query;
    return `stats:${type}:${period}`;
  }
});

// Cache invalidation helper
export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    await cacheService.flushPattern(pattern);
    logger.info(`Cache invalidated for pattern: ${pattern}`);
  } catch (error) {
    logger.error(`Failed to invalidate cache for pattern ${pattern}:`, error);
  }
};

// User-specific cache invalidation
export const invalidateUserCache = async (userId: string): Promise<void> => {
  await invalidateCache(`user:${userId}:*`);
  await invalidateCache(`user_loans:${userId}`);
  await invalidateCache(`user_payments:${userId}`);
};

// Loan-specific cache invalidation
export const invalidateLoanCache = async (loanId: string): Promise<void> => {
  await invalidateCache(`loan:${loanId}:*`);
};

// Payment-specific cache invalidation
export const invalidatePaymentCache = async (paymentId: string): Promise<void> => {
  await invalidateCache(`payment:${paymentId}:*`);
};