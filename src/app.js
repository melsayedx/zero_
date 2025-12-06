require('dotenv').config();
const fastify = require('fastify');
const DIContainer = require('./infrastructure/config/di-container');
const setupRoutes = require('./interfaces/http/routes');
const { setupGrpcServer, shutdownGrpcServer } = require('./interfaces/grpc/server');
const createContentParserMiddleware = require('./interfaces/http/content-parser.middleware');
const cluster = require('cluster');

/**
 * Create application instance
 * Supports both standalone and cluster modes
 */
async function createApp(options = {}) {
  const { clusterMode = false, workerId = null, skipListen = false } = options;

  // Initialize DI Container
  const container = new DIContainer();
  await container.initialize();

  // Create Fastify app
  const app = fastify({
    logger: false,
    bodyLimit: 10485760, // 10MB limit (same as Express)
    requestIdHeader: 'x-request-id'
  });

  // Register plugins
  await app.register(require('@fastify/helmet'));

  // Enable HTTP compression (gzip/brotli)
  await app.register(require('@fastify/compress'), {
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Only compress responses > 1KB
    customTypes: /^text\/|\+json$|\+text$|\+xml$|javascript|css|font|svg/
  });

  // Content parser middleware - handles both JSON and Protocol Buffer formats
  // Pass validation service for worker-based protobuf parsing
  const validationService = container.get('validationService');
  await app.register(createContentParserMiddleware(validationService));

  // Request logging hook
  app.addHook('onRequest', (request, reply, done) => {
    const format = request.contentFormat ? ` [${request.contentFormat}]` : '';
    const workerInfo = clusterMode ? ` [Worker ${workerId}]` : '';
    console.log(`${new Date().toISOString()}${workerInfo} - ${request.method} ${request.url}${format}`);
    done();
  });

  // Setup routes with controllers from DI container
  const controllers = container.getControllers();
  await setupRoutes(app, controllers);

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      success: false,
      message: 'Endpoint not found'
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    console.error('Unhandled error:', error);
    return reply.code(500).send({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  });

  // Server configuration
  const HTTP_PORT = process.env.PORT || 3000;
  const GRPC_PORT = process.env.GRPC_PORT || 50051;

  // Start HTTP server (unless skipListen is true)
  let httpServer;
  if (skipListen) {
    // Don't start the server, just return the app
    // (Used by HTTP/2 and HTTP/3 implementations)
    httpServer = null;
  } else {
    try {
      await app.listen({ port: HTTP_PORT, host: '0.0.0.0' });
      httpServer = app.server;

      if (clusterMode) {
        console.log(`[Worker ${workerId}] HTTP server listening on port ${HTTP_PORT}`);
        console.log(`[Worker ${workerId}] gRPC server listening on port ${GRPC_PORT}`);
      } else {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - Started Successfully           ║
║                  (Fastify Edition)                        ║
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
  ✓ Fastify Framework (3x faster than Express)

ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}
Database: ${process.env.CLICKHOUSE_DATABASE || 'logs_db'}
MongoDB: ${process.env.MONGODB_URI || 'mongodb://mongodb:27017/logs_platform'}
  `);
      }
    } catch (error) {
      console.error('Failed to start HTTP server:', error.message);
      throw error;
    }
  }

  // Start gRPC server (unless skipListen is true)
  let grpcServer;
  if (!skipListen) {
    const handlers = container.getHandlers();
    grpcServer = setupGrpcServer(handlers, GRPC_PORT);
  }

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

      return new Promise(async (resolve) => {
        try {
          // Close HTTP server (Fastify app)
          if (app) {
            await app.close();
            console.log('HTTP server closed');
          }

          // Shutdown gRPC server
          if (grpcServer) {
            await shutdownGrpcServer(grpcServer);
            console.log('gRPC server closed');
          }

          // Cleanup resources
          await container.cleanup();
          console.log('Resources cleaned up');

          resolve();
        } catch (error) {
          console.error('Error during shutdown:', error);
          resolve();
        }
      });
    },

    /**
     * Stop accepting new connections (for graceful restart)
     */
    async stopAcceptingConnections() {
      if (app) {
        await app.close(); // Stop accepting, but don't wait
      }
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
