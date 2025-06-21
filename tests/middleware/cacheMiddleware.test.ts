import request from 'supertest';
import express from 'express';
import { cacheMiddleware, statsCacheMiddleware } from '../../src/middleware/cacheMiddleware';
import { cacheService } from '../../src/services/cacheService';

// Mock cache service
jest.mock('../../src/services/cacheService');
const mockedCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('Cache Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('cacheMiddleware', () => {
    test('should cache GET responses', async () => {
      mockedCacheService.get.mockResolvedValue(null);
      mockedCacheService.set.mockResolvedValue(true);

      app.get('/test', cacheMiddleware(), (req, res) => {
        res.json({ message: 'test response' });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ message: 'test response' });
      expect(mockedCacheService.get).toHaveBeenCalledWith('cache:GET:/test');
      expect(mockedCacheService.set).toHaveBeenCalledWith(
        'cache:GET:/test',
        { message: 'test response' },
        300
      );
    });

    test('should return cached response when available', async () => {
      const cachedData = { message: 'cached response' };
      mockedCacheService.get.mockResolvedValue(cachedData);

      app.get('/test', cacheMiddleware(), (req, res) => {
        res.json({ message: 'fresh response' });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual(cachedData);
      expect(mockedCacheService.get).toHaveBeenCalledWith('cache:GET:/test');
      expect(mockedCacheService.set).not.toHaveBeenCalled();
    });

    test('should not cache non-GET requests', async () => {
      app.post('/test', cacheMiddleware(), (req, res) => {
        res.json({ message: 'post response' });
      });

      await request(app)
        .post('/test')
        .expect(200);

      expect(mockedCacheService.get).not.toHaveBeenCalled();
      expect(mockedCacheService.set).not.toHaveBeenCalled();
    });

    test('should handle cache errors gracefully', async () => {
      mockedCacheService.get.mockRejectedValue(new Error('Cache error'));

      app.get('/test', cacheMiddleware(), (req, res) => {
        res.json({ message: 'test response' });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ message: 'test response' });
    });
  });

  describe('statsCacheMiddleware', () => {
    test('should generate correct cache key for stats', async () => {
      mockedCacheService.get.mockResolvedValue(null);
      mockedCacheService.set.mockResolvedValue(true);

      app.get('/stats', statsCacheMiddleware, (req, res) => {
        res.json({ stats: 'data' });
      });

      await request(app)
        .get('/stats?period=weekly&type=loans')
        .expect(200);

      expect(mockedCacheService.get).toHaveBeenCalledWith('stats:loans:weekly');
    });
  });

  describe('Custom Options', () => {
    test('should use custom TTL', async () => {
      mockedCacheService.get.mockResolvedValue(null);
      mockedCacheService.set.mockResolvedValue(true);

      app.get('/test', cacheMiddleware({ ttl: 600 }), (req, res) => {
        res.json({ message: 'test' });
      });

      await request(app)
        .get('/test')
        .expect(200);

      expect(mockedCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        600
      );
    });

    test('should use custom key generator', async () => {
      mockedCacheService.get.mockResolvedValue(null);
      mockedCacheService.set.mockResolvedValue(true);

      const customKeyGenerator = (req: express.Request) => `custom:${req.path}`;

      app.get('/test', cacheMiddleware({ keyGenerator: customKeyGenerator }), (req, res) => {
        res.json({ message: 'test' });
      });

      await request(app)
        .get('/test')
        .expect(200);

      expect(mockedCacheService.get).toHaveBeenCalledWith('custom:/test');
    });

    test('should respect condition function', async () => {
      const condition = (req: express.Request) => req.query.cache === 'true';

      app.get('/test', cacheMiddleware({ condition }), (req, res) => {
        res.json({ message: 'test' });
      });

      // Should not cache when condition is false
      await request(app)
        .get('/test?cache=false')
        .expect(200);

      expect(mockedCacheService.get).not.toHaveBeenCalled();

      jest.clearAllMocks();
      mockedCacheService.get.mockResolvedValue(null);

      // Should cache when condition is true
      await request(app)
        .get('/test?cache=true')
        .expect(200);

      expect(mockedCacheService.get).toHaveBeenCalled();
    });
  });
});