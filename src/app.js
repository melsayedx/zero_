require('dotenv').config();
const express = require('express');
const DIContainer = require('./config/di-container');
const setupRoutes = require('./adapters/http/routes');
const { setupGrpcServer, shutdownGrpcServer } = require('./adapters/grpc/server');
const compression = require('compression');
const helmet = require('helmet');
const { createContentParserMiddleware } = require('./adapters/http/content-parser.middleware');
const cluster = require('cluster');

/**
 * Create application instance
 * Supports both standalone and cluster modes
 */
async function createApp(options = {}) {
  const { clusterMode = false, workerId = null } = options;
  
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

  // Parse JSON requests (backward compatible)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Content parser middleware - handles both JSON and Protocol Buffer formats
  // Pass validation service for worker-based protobuf parsing
  const validationService = container.get('validationService');
  app.use(createContentParserMiddleware(validationService));

  // Request logging middleware (simple)
  app.use((req, res, next) => {
    const format = req.contentFormat ? ` [${req.contentFormat}]` : '';
    const workerInfo = clusterMode ? ` [Worker ${workerId}]` : '';
    console.log(`${new Date().toISOString()}${workerInfo} - ${req.method} ${req.path}${format}`);
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
    if (clusterMode) {
      console.log(`[Worker ${workerId}] HTTP server listening on port ${HTTP_PORT}`);
      console.log(`[Worker ${workerId}] gRPC server listening on port ${GRPC_PORT}`);
    } else {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - Started Successfully           ║
╚═══════════════════════════════════════════════════════════╝

HTTP Server running on: http://localhost:${HTTP_PORT}
gRPC Server running on: 0.0.0.0:${GRPC_PORT}
Environment: ${process.env.NODE_ENV || 'development'}

HTTP Endpoints:
  GET  /health             - Health check
  GET  /api/stats          - Performance stats (includes batch buffer metrics)
  POST /api/logs           - Ingest logs (JSON or Protocol Buffer)
  GET  /api/logs/:app_id   - Retrieve logs for a specific app (default: 1000 rows)

gRPC Methods:
  IngestLogs               - Ingest log entries
  GetLogsByAppId           - Retrieve logs by app_id
  HealthCheck              - Health check

Supported Content Types:
  - application/json              (JSON format - backward compatible)
  - application/x-protobuf        (Protocol Buffer - single entry)
  - application/x-protobuf-batch  (Protocol Buffer - batch)

Performance Features:
  ✓ Batch Validation (50-140% faster)
  ✓ Worker Threads (Adaptive: validation, protobuf, JSON)
  ✓ ClickHouse Buffer (99% fewer operations)
  ✓ Protocol Buffers (40-60% smaller payloads)
  ✓ HTTP Compression (enabled)

ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}
Database: ${process.env.CLICKHOUSE_DATABASE || 'logs_db'}
  `);
    }
  });

  // Start gRPC server
  const handlers = container.getHandlers();
  const grpcServer = setupGrpcServer(handlers, GRPC_PORT);

  // Return application instance with lifecycle methods
  return {
    app,
    httpServer,
    grpcServer,
    container,
    
    /**
     * Start the application (already started above)
     */
    async start() {
      // Servers are already started
      if (clusterMode) {
        console.log(`[Worker ${workerId}] Application started successfully`);
      }
    },
    
    /**
     * Gracefully shutdown the application
     */
    async shutdown() {
      console.log('Starting graceful shutdown...');
      
      return new Promise((resolve) => {
        // Close HTTP server
        httpServer.close(async () => {
          console.log('HTTP server closed');
          
          try {
            // Shutdown gRPC server
            await shutdownGrpcServer(grpcServer);
            console.log('gRPC server closed');
            
            // Cleanup resources
            await container.cleanup();
            console.log('Resources cleaned up');
            
            resolve();
          } catch (error) {
            console.error('Error during shutdown:', error);
            resolve();
          }
        });
      });
    },
    
    /**
     * Stop accepting new connections (for graceful restart)
     */
    async stopAcceptingConnections() {
      httpServer.close(); // Stop accepting, but don't wait
    },
    
    /**
     * Wait for active requests to complete
     */
    async waitForActiveRequests() {
      // In a real implementation, track active requests
      // For now, just wait a bit for pending requests
      await new Promise(resolve => setTimeout(resolve, 5000));
    },
    
    /**
     * Get application statistics
     */
    getStats() {
      return validationService ? validationService.getStats() : {};
    },
    
    /**
     * Handle messages from cluster master (if in cluster mode)
     */
    handleMasterMessage(message) {
      // Custom message handling
      console.log(`[Worker ${workerId}] Received message from master:`, message.type);
    },
    
    /**
     * Update configuration (for hot reload)
     */
    updateConfig(config) {
      console.log(`[Worker ${workerId}] Config update:`, config);
      // Implement config hot-reload if needed
    }
  };
}

// If running directly (not in cluster mode), start the app
if (require.main === module && !cluster.isWorker) {
  (async () => {
    const appInstance = await createApp();
    
    // Setup signal handlers for standalone mode
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      await appInstance.shutdown();
      process.exit(0);
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
  })();
}

module.exports = createApp;
