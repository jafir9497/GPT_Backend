import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      username: 'default',
      password: 'eoWdUBITtvjgvsXbZwHccLeQ0AFu015T',
      socket: {
        host: 'redis-16062.c330.asia-south1-1.gce.redns.redis-cloud.com',
        port: 16062,
        connectTimeout: 5000,
      },
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis Client Disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
      }
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      // Don't throw error - allow app to continue without cache
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async increment(key: string, amount: number = 1): Promise<number | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      return await this.client.incrBy(key, amount);
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return null;
    }
  }

  async setWithTTL(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    return this.set(key, value, ttlSeconds);
  }

  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T | null> {
    try {
      // Try to get from cache first
      const cachedValue = await this.get<T>(key);
      if (cachedValue !== null) {
        return cachedValue;
      }

      // If not in cache, fetch from source
      const value = await fetchFunction();
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttlSeconds);
      }

      return value;
    } catch (error) {
      logger.error(`Cache getOrSet error for key ${key}:`, error);
      // If cache fails, try to fetch directly
      try {
        return await fetchFunction();
      } catch (fetchError) {
        logger.error(`Fetch function error for key ${key}:`, fetchError);
        return null;
      }
    }
  }

  async flushPattern(pattern: string): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logger.error(`Cache flush pattern error for pattern ${pattern}:`, error);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Cache ping error:', error);
      return false;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Cache key generators for different entities
  static generateUserKey(userId: string): string {
    return `user:${userId}`;
  }

  static generateLoanKey(loanId: string): string {
    return `loan:${loanId}`;
  }

  static generatePaymentKey(paymentId: string): string {
    return `payment:${paymentId}`;
  }

  static generateQRSessionKey(sessionId: string): string {
    return `qr_session:${sessionId}`;
  }

  static generateUserLoansKey(userId: string): string {
    return `user_loans:${userId}`;
  }

  static generateUserPaymentsKey(userId: string): string {
    return `user_payments:${userId}`;
  }

  static generateStatsKey(type: string, period: string): string {
    return `stats:${type}:${period}`;
  }
}

export const cacheService = new CacheService();