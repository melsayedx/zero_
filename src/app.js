require('dotenv').config();
const express = require('express');
const DIContainer = require('./config/di-container');
const setupRoutes = require('./adapters/http/routes');
const compression = require('compression');
const helmet = require('helmet');

// Initialize DI Container
const container = new DIContainer();
container.initialize();

// Create Express app
const app = express();

// Middleware
app.use(helmet());

// Enable HTTP compression (gzip/brotli)
app.use(compression({
  level: 6,              // Compression level (1-9)
  threshold: 1024,       // Only compress responses > 1KB
  filter: (req, res) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
          return false;
      }
      return compression.filter(req, res);
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (simple)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Setup routes with controllers from DI container
const controllers = container.getControllers();
app.use(setupRoutes(controllers));

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Server configuration
const PORT = process.env.PORT || 3000;

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - Started Successfully           ║
╚═══════════════════════════════════════════════════════════╝

Server running on: http://localhost:${PORT}
Environment: ${process.env.NODE_ENV || 'development'}

Available endpoints:
  GET  /health             - Health check
  GET  /metrics            - Application metrics (req/sec, uptime, etc)
  POST /api/logs           - Ingest single log entry
  POST /api/logs/batch     - Ingest multiple logs (high-throughput)
  GET  /api/logs/:app_id   - Retrieve logs for a specific app (default: 1000 rows)

ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}
Database: ${process.env.CLICKHOUSE_DATABASE || 'logs_db'}
  `);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      await container.cleanup();
      console.log('Resources cleaned up.');
      process.exit(0);
    } catch (error) {
      console.error('Error during cleanup:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;

