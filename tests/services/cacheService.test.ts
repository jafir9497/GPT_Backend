import { cacheService } from '../../src/services/cacheService';

describe('CacheService', () => {
  beforeAll(async () => {
    // Connect to test Redis instance
    await cacheService.connect();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await cacheService.disconnect();
  });

  beforeEach(async () => {
    // Clear all keys before each test
    await cacheService.flushPattern('*');
  });

  describe('Basic Operations', () => {
    test('should set and get a value', async () => {
      const key = 'test:key';
      const value = { id: 1, name: 'Test' };

      const setResult = await cacheService.set(key, value);
      expect(setResult).toBe(true);

      const getValue = await cacheService.get(key);
      expect(getValue).toEqual(value);
    });

    test('should return null for non-existent key', async () => {
      const result = await cacheService.get('non:existent');
      expect(result).toBeNull();
    });

    test('should delete a key', async () => {
      const key = 'test:delete';
      const value = 'test value';

      await cacheService.set(key, value);
      expect(await cacheService.exists(key)).toBe(true);

      const deleteResult = await cacheService.del(key);
      expect(deleteResult).toBe(true);
      expect(await cacheService.exists(key)).toBe(false);
    });

    test('should check if key exists', async () => {
      const key = 'test:exists';
      
      expect(await cacheService.exists(key)).toBe(false);
      
      await cacheService.set(key, 'value');
      expect(await cacheService.exists(key)).toBe(true);
    });
  });

  describe('TTL Operations', () => {
    test('should set value with TTL', async () => {
      const key = 'test:ttl';
      const value = 'expires soon';
      const ttl = 1; // 1 second

      await cacheService.setWithTTL(key, value, ttl);
      
      // Should exist immediately
      expect(await cacheService.exists(key)).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(await cacheService.exists(key)).toBe(false);
    });
  });

  describe('Increment Operations', () => {
    test('should increment a counter', async () => {
      const key = 'test:counter';
      
      const result1 = await cacheService.increment(key);
      expect(result1).toBe(1);
      
      const result2 = await cacheService.increment(key, 5);
      expect(result2).toBe(6);
    });
  });

  describe('Get or Set Pattern', () => {
    test('should fetch and cache data when not in cache', async () => {
      const key = 'test:getOrSet';
      const expectedValue = { data: 'fetched from source' };
      
      const fetchFunction = jest.fn().mockResolvedValue(expectedValue);
      
      const result = await cacheService.getOrSet(key, fetchFunction, 60);
      
      expect(fetchFunction).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedValue);
      expect(await cacheService.exists(key)).toBe(true);
    });

    test('should return cached data without calling fetch function', async () => {
      const key = 'test:cached';
      const cachedValue = { data: 'cached data' };
      
      // Pre-populate cache
      await cacheService.set(key, cachedValue);
      
      const fetchFunction = jest.fn().mockResolvedValue({ data: 'fresh data' });
      
      const result = await cacheService.getOrSet(key, fetchFunction, 60);
      
      expect(fetchFunction).not.toHaveBeenCalled();
      expect(result).toEqual(cachedValue);
    });
  });

  describe('Pattern Operations', () => {
    test('should flush keys by pattern', async () => {
      // Set multiple keys with pattern
      await cacheService.set('user:1:profile', { name: 'User 1' });
      await cacheService.set('user:2:profile', { name: 'User 2' });
      await cacheService.set('order:1:details', { total: 100 });
      
      // Verify keys exist
      expect(await cacheService.exists('user:1:profile')).toBe(true);
      expect(await cacheService.exists('user:2:profile')).toBe(true);
      expect(await cacheService.exists('order:1:details')).toBe(true);
      
      // Flush user pattern
      await cacheService.flushPattern('user:*');
      
      // User keys should be gone, order key should remain
      expect(await cacheService.exists('user:1:profile')).toBe(false);
      expect(await cacheService.exists('user:2:profile')).toBe(false);
      expect(await cacheService.exists('order:1:details')).toBe(true);
    });
  });

  describe('Key Generators', () => {
    test('should generate correct cache keys', () => {
      expect(cacheService.constructor.generateUserKey('123')).toBe('user:123');
      expect(cacheService.constructor.generateLoanKey('456')).toBe('loan:456');
      expect(cacheService.constructor.generatePaymentKey('789')).toBe('payment:789');
      expect(cacheService.constructor.generateQRSessionKey('abc')).toBe('qr_session:abc');
      expect(cacheService.constructor.generateStatsKey('loans', 'daily')).toBe('stats:loans:daily');
    });
  });

  describe('Connection Status', () => {
    test('should return connection status', () => {
      const status = cacheService.getConnectionStatus();
      expect(typeof status).toBe('boolean');
    });

    test('should ping successfully', async () => {
      const pingResult = await cacheService.ping();
      expect(pingResult).toBe(true);
    });
  });
});