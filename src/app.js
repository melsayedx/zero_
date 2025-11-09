/**
 * Log Ingestion Platform - Main Application
 * High-performance observability platform built with Express.js, ClickHouse, MongoDB, and Redis
 * 
 * Architecture:
 * - Express.js for API layer
 * - ClickHouse for time-series log storage (analytics data)
 * - MongoDB for application state (dashboards, users, schemas, alerts)
 * - Redis for caching and session management
 * - Batch processing for high-throughput ingestion
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { compressionMiddleware } = require('./api/middleware/compression.middleware');
const { notFound, errorHandler, initializeErrorHandlers } = require('./api/middleware/error.middleware');
const logger = require('./utils/logger');
const performanceMonitor = require('./utils/performance-monitor');

// Database configurations
const { initClickHouse } = require('./config/clickhouse.config');
const { initMongoDB } = require('./config/mongodb.config');
const { initRedis } = require('./config/redis.config');

// Services
const clickhouseService = require('./services/storage/clickhouse.service');
const logIngestionService = require('./services/ingestion/log-ingestion.service');
const { setupSchema } = require('./models/clickhouse/logs.schema');
const { getClickHouseClient } = require('./config/clickhouse.config');

// Routes
const ingestionRoutes = require('./api/routes/ingestion.routes');
const queryRoutes = require('./api/routes/query.routes');
const dashboardRoutes = require('./api/routes/dashboard.routes');
const schemaRoutes = require('./api/routes/schema.routes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize error handlers
initializeErrorHandlers();

// ===== MIDDLEWARE =====

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Adjust based on your needs
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // Larger limit for batch ingestion
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compressionMiddleware);

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.http(req, res, duration);
    performanceMonitor.trackRequest(duration, res.statusCode);
  });
  
  next();
});

// ===== HEALTH CHECK ROUTE =====

app.get('/health', async (req, res) => {
  try {
    const clickhouseHealth = await require('./config/clickhouse.config').healthCheck();
    const mongodbHealth = await require('./config/mongodb.config').healthCheck();
    const redisHealth = await require('./config/redis.config').healthCheck();
    
    const systemHealth = performanceMonitor.checkHealth();
    
    const allHealthy = clickhouseHealth && mongodbHealth && redisHealth && systemHealth.healthy;
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        clickhouse: clickhouseHealth ? 'up' : 'down',
        mongodb: mongodbHealth ? 'up' : 'down',
        redis: redisHealth ? 'up' : 'down'
      },
      system: systemHealth
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ===== METRICS ENDPOINT =====

app.get('/metrics', (req, res) => {
  const metrics = performanceMonitor.getAllMetrics();
  res.json(metrics);
});

// ===== API ROUTES =====

const API_VERSION = process.env.API_VERSION || 'v1';

app.use(`/api/${API_VERSION}/ingest`, ingestionRoutes);
app.use(`/api/${API_VERSION}/query`, queryRoutes);
app.use(`/api/${API_VERSION}/dashboards`, dashboardRoutes);
app.use(`/api/${API_VERSION}/schemas`, schemaRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Log Ingestion Platform',
    version: '1.0.0',
    status: 'running',
    apiVersion: API_VERSION,
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      ingestion: `/api/${API_VERSION}/ingest`,
      query: `/api/${API_VERSION}/query`,
      dashboards: `/api/${API_VERSION}/dashboards`,
      schemas: `/api/${API_VERSION}/schemas`
    },
    documentation: 'See README.md for detailed API documentation'
  });
});

// ===== ERROR HANDLING =====

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// ===== DATABASE INITIALIZATION =====

/**
 * Initialize all database connections
 */
async function initializeDatabases() {
  try {
    logger.info('Initializing databases...');
    
    // Initialize ClickHouse
    await initClickHouse();
    await clickhouseService.init();
    
    // Setup ClickHouse schema
    const clickhouseClient = getClickHouseClient();
    await setupSchema(clickhouseClient);
    logger.info('ClickHouse schema initialized');
    
    // Initialize MongoDB
    await initMongoDB();
    
    // Initialize Redis
    await initRedis();
    
    logger.info('All databases initialized successfully');
    return true;
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }
}

/**
 * Initialize services
 */
async function initializeServices() {
  try {
    logger.info('Initializing services...');
    
    // Initialize log ingestion service
    await logIngestionService.init();
    
    logger.info('All services initialized successfully');
    return true;
  } catch (error) {
    logger.error('Service initialization failed', { error: error.message });
    throw error;
  }
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize databases
    await initializeDatabases();
    
    // Initialize services
    await initializeServices();
    
    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info('Server started', {
        port: PORT,
        environment: NODE_ENV,
        apiVersion: API_VERSION
      });
      
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        Log Ingestion Platform - v1.0.0                     ║
║                                                            ║
║  Server running on: http://localhost:${PORT}               ${PORT < 10000 ? ' ' : ''}║
║  Environment: ${NODE_ENV.padEnd(11)}                               ║
║  API Version: ${API_VERSION.padEnd(11)}                               ║
║                                                            ║
║  Endpoints:                                                ║
║    • Health: http://localhost:${PORT}/health              ${PORT < 10000 ? ' ' : ''}║
║    • Metrics: http://localhost:${PORT}/metrics            ${PORT < 10000 ? ' ' : ''}║
║    • API: http://localhost:${PORT}/api/${API_VERSION}                ${PORT < 10000 ? ' ' : ''}║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
    
    // Start periodic metrics logging
    performanceMonitor.startPeriodicLogging(60);
    
    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Flush remaining logs
          await logIngestionService.flush();
          logger.info('Remaining logs flushed');
          
          // Close database connections
          await require('./config/clickhouse.config').closeClickHouse();
          await require('./config/mongodb.config').closeMongoDB();
          await require('./config/redis.config').closeRedis();
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error: error.message });
          process.exit(1);
        }
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app;

