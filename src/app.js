require('dotenv').config();
const express = require('express');
const DIContainer = require('./config/di-container');
const setupRoutes = require('./adapters/http/routes');
const { setupGrpcServer, shutdownGrpcServer } = require('./adapters/grpc/server');
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
const HTTP_PORT = process.env.PORT || 3000;
const GRPC_PORT = process.env.GRPC_PORT || 50051;

// Start HTTP server
const httpServer = app.listen(HTTP_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - Started Successfully           ║
╚═══════════════════════════════════════════════════════════╝

HTTP Server running on: http://localhost:${HTTP_PORT}
gRPC Server running on: 0.0.0.0:${GRPC_PORT}
Environment: ${process.env.NODE_ENV || 'development'}

HTTP Endpoints:
  GET  /health             - Health check
  GET  /metrics            - Application metrics (req/sec, uptime, etc)
  POST /api/logs           - Ingest single log entry
  POST /api/logs/batch     - Ingest multiple logs (high-throughput)
  GET  /api/logs/:app_id   - Retrieve logs for a specific app (default: 1000 rows)

gRPC Methods:
  IngestLogs               - Ingest log entries
  GetLogsByAppId           - Retrieve logs by app_id
  HealthCheck              - Health check

ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}
Database: ${process.env.CLICKHOUSE_DATABASE || 'logs_db'}
  `);
});

// Start gRPC server
const handlers = container.getHandlers();
const grpcServer = setupGrpcServer(handlers, GRPC_PORT);

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Close HTTP server first
  httpServer.close(async () => {
    console.log('HTTP server closed.');
    
    try {
      // Shutdown gRPC server
      await shutdownGrpcServer(grpcServer);
      console.log('gRPC server closed.');
      
      // Cleanup resources
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

