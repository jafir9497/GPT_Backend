const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const client = require('prom-client');
const responseTime = require('response-time');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class MonitoringService {
  constructor() {
    this.initializeSentry();
    this.initializePrometheus();
    this.setupCustomMetrics();
  }

  // Initialize Sentry for error tracking
  initializeSentry() {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        integrations: [
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({ app: null }),
          new ProfilingIntegration(),
        ],
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        beforeSend(event) {
          // Filter out non-critical errors in production
          if (process.env.NODE_ENV === 'production') {
            if (event.exception) {
              const error = event.exception.values[0];
              if (error && error.type === 'ValidationError') {
                return null; // Don't send validation errors to Sentry in production
              }
            }
          }
          return event;
        },
      });

      console.log('Sentry initialized successfully');
    } else {
      console.warn('Sentry DSN not provided, error tracking disabled');
    }
  }

  // Initialize Prometheus metrics
  initializePrometheus() {
    // Create a Registry
    this.register = new client.Registry();

    // Add default metrics
    client.collectDefaultMetrics({
      register: this.register,
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });

    console.log('Prometheus metrics initialized');
  }

  // Setup custom application metrics
  setupCustomMetrics() {
    // HTTP Request metrics
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      registers: [this.register],
    });

    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    // Business metrics
    this.activeLoansGauge = new client.Gauge({
      name: 'active_loans_total',
      help: 'Total number of active loans',
      registers: [this.register],
    });

    this.totalOutstandingGauge = new client.Gauge({
      name: 'total_outstanding_amount',
      help: 'Total outstanding loan amount',
      registers: [this.register],
    });

    this.dailyPaymentsCounter = new client.Counter({
      name: 'daily_payments_total',
      help: 'Total daily payments processed',
      labelNames: ['payment_method', 'status'],
      registers: [this.register],
    });

    this.loanApplicationsCounter = new client.Counter({
      name: 'loan_applications_total',
      help: 'Total loan applications',
      labelNames: ['status'],
      registers: [this.register],
    });

    // Database metrics
    this.databaseConnectionsGauge = new client.Gauge({
      name: 'database_connections_active',
      help: 'Number of active database connections',
      registers: [this.register],
    });

    this.databaseQueryDuration = new client.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    // Queue metrics
    this.queueJobsGauge = new client.Gauge({
      name: 'queue_jobs_pending',
      help: 'Number of pending jobs in queues',
      labelNames: ['queue_name'],
      registers: [this.register],
    });

    this.queueJobProcessingTime = new client.Histogram({
      name: 'queue_job_processing_duration_seconds',
      help: 'Duration of queue job processing in seconds',
      labelNames: ['queue_name', 'job_type', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
      registers: [this.register],
    });

    // System health metrics
    this.systemHealthGauge = new client.Gauge({
      name: 'system_health_status',
      help: 'System health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['component'],
      registers: [this.register],
    });

    console.log('Custom metrics initialized');
  }

  // Middleware for HTTP request tracking
  getHttpMetricsMiddleware() {
    return responseTime((req, res, time) => {
      const route = req.route ? req.route.path : req.path;
      const method = req.method;
      const statusCode = res.statusCode.toString();

      // Record request duration
      this.httpRequestDuration
        .labels(method, route, statusCode)
        .observe(time / 1000); // Convert ms to seconds

      // Increment request counter
      this.httpRequestTotal
        .labels(method, route, statusCode)
        .inc();
    });
  }

  // Sentry middleware
  getSentryMiddleware() {
    return {
      requestHandler: Sentry.Handlers.requestHandler(),
      tracingHandler: Sentry.Handlers.tracingHandler(),
      errorHandler: Sentry.Handlers.errorHandler(),
    };
  }

  // Record custom business events
  recordLoanApplication(status) {
    this.loanApplicationsCounter.labels(status).inc();
  }

  recordPayment(paymentMethod, status) {
    this.dailyPaymentsCounter.labels(paymentMethod, status).inc();
  }

  recordDatabaseQuery(operation, table, duration) {
    this.databaseQueryDuration
      .labels(operation, table)
      .observe(duration / 1000);
  }

  recordQueueJob(queueName, jobType, status, duration) {
    this.queueJobProcessingTime
      .labels(queueName, jobType, status)
      .observe(duration / 1000);
  }

  updateQueuePendingJobs(queueName, count) {
    this.queueJobsGauge.labels(queueName).set(count);
  }

  updateSystemHealth(component, isHealthy) {
    this.systemHealthGauge.labels(component).set(isHealthy ? 1 : 0);
  }

  // Update business metrics periodically
  async updateBusinessMetrics() {
    try {
      // Active loans count
      const activeLoansCount = await prisma.activeLoan.count({
        where: { loanStatus: 'ACTIVE' }
      });
      this.activeLoansGauge.set(activeLoansCount);

      // Total outstanding amount
      const outstandingResult = await prisma.activeLoan.aggregate({
        where: { loanStatus: 'ACTIVE' },
        _sum: { totalOutstanding: true }
      });
      const totalOutstanding = parseFloat(outstandingResult._sum.totalOutstanding || 0);
      this.totalOutstandingGauge.set(totalOutstanding);

      console.log(`Business metrics updated: ${activeLoansCount} active loans, ₹${totalOutstanding} outstanding`);
    } catch (error) {
      console.error('Failed to update business metrics:', error);
      this.updateSystemHealth('business_metrics', false);
    }
  }

  // Health check for all system components
  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };

    try {
      // Database health check
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbDuration = Date.now() - dbStart;
      
      healthStatus.checks.database = {
        status: 'healthy',
        responseTime: `${dbDuration}ms`
      };
      this.updateSystemHealth('database', true);
    } catch (error) {
      healthStatus.checks.database = {
        status: 'unhealthy',
        error: error.message
      };
      this.updateSystemHealth('database', false);
      healthStatus.status = 'unhealthy';
    }

    try {
      // Redis health check (for queue system)
      const Redis = require('ioredis');
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
      });

      const redisStart = Date.now();
      await redis.ping();
      const redisDuration = Date.now() - redisStart;
      
      healthStatus.checks.redis = {
        status: 'healthy',
        responseTime: `${redisDuration}ms`
      };
      this.updateSystemHealth('redis', true);
      
      await redis.disconnect();
    } catch (error) {
      healthStatus.checks.redis = {
        status: 'unhealthy',
        error: error.message
      };
      this.updateSystemHealth('redis', false);
      healthStatus.status = 'degraded';
    }

    // Memory usage check
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    healthStatus.checks.memory = {
      status: memUsageMB.heapUsed < 512 ? 'healthy' : 'warning',
      usage: memUsageMB
    };

    // CPU usage check
    const cpuUsage = process.cpuUsage();
    healthStatus.checks.cpu = {
      status: 'healthy',
      usage: {
        user: cpuUsage.user,
        system: cpuUsage.system
      }
    };

    return healthStatus;
  }

  // Get application metrics for Prometheus
  async getMetrics() {
    return await this.register.metrics();
  }

  // Custom error logging with context
  logError(error, context = {}) {
    Sentry.withScope((scope) => {
      // Add context to Sentry
      Object.keys(context).forEach(key => {
        scope.setContext(key, context[key]);
      });
      
      scope.setLevel('error');
      Sentry.captureException(error);
    });

    // Also log to console for development
    console.error('Application Error:', {
      message: error.message,
      stack: error.stack,
      context
    });
  }

  // Log important business events
  logBusinessEvent(event, data = {}) {
    Sentry.addBreadcrumb({
      message: event,
      category: 'business',
      level: 'info',
      data
    });

    console.log('Business Event:', { event, data });
  }

  // Performance monitoring for critical functions
  async monitorPerformance(operationName, operation, context = {}) {
    const startTime = Date.now();
    const transaction = Sentry.startTransaction({
      name: operationName,
      op: 'business_operation'
    });

    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      transaction.setStatus('ok');
      transaction.setData('duration', duration);
      
      console.log(`Performance: ${operationName} completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      transaction.setStatus('internal_error');
      transaction.setData('duration', duration);
      
      this.logError(error, { 
        operationName, 
        duration,
        ...context 
      });
      
      throw error;
    } finally {
      transaction.finish();
    }
  }

  // Alert system for critical issues
  async sendAlert(level, message, details = {}) {
    const alert = {
      level, // 'critical', 'warning', 'info'
      message,
      details,
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      environment: process.env.NODE_ENV
    };

    // Log to Sentry
    Sentry.withScope((scope) => {
      scope.setLevel(level === 'critical' ? 'fatal' : level);
      scope.setContext('alert', alert);
      Sentry.captureMessage(message);
    });

    // In production, you might want to integrate with:
    // - Slack webhook
    // - PagerDuty
    // - Email notifications
    // - SMS alerts

    console.log('ALERT:', alert);

    // Store alert in database for admin dashboard
    try {
      await prisma.systemAlert.create({
        data: {
          level: level.toUpperCase(),
          message,
          details: details,
          acknowledged: false,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to store alert in database:', error);
    }
  }

  // Initialize periodic metric updates
  startMetricUpdates() {
    // Update business metrics every 5 minutes
    setInterval(async () => {
      await this.updateBusinessMetrics();
    }, 5 * 60 * 1000);

    // Perform health checks every 2 minutes
    setInterval(async () => {
      const health = await this.performHealthCheck();
      if (health.status === 'unhealthy') {
        await this.sendAlert('critical', 'System health check failed', health);
      }
    }, 2 * 60 * 1000);

    console.log('Metric update intervals started');
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down monitoring service...');
    
    // Final metric update
    await this.updateBusinessMetrics();
    
    // Close Sentry
    await Sentry.close(2000);
    
    console.log('Monitoring service shutdown complete');
  }
}

module.exports = MonitoringService;