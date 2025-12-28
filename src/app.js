require('@dotenvx/dotenvx').config();
const fastify = require('fastify');
const DIContainer = require('./infrastructure/config/di-container');
const setupRoutes = require('./interfaces/http/routes');
const { setupGrpcServer, shutdownGrpcServer } = require('./interfaces/grpc/server');
const createContentParserPlugin = require('./interfaces/plugins/content-parser.plugin');
const logsOpenApiConfig = require('./interfaces/http/schemas/logs-openapi');
const cluster = require('cluster');
const fs = require('fs');
const path = require('path');
const { LoggerFactory } = require('./infrastructure/logging');

// Initialize bootstrap logger
const logger = LoggerFactory.getInstance({
  mode: process.env.LOG_MODE || 'null',
  level: process.env.LOG_LEVEL || 'info',
  pretty: process.env.LOG_PRETTY === 'true',
}).child({ component: 'Bootstrap' });

/**
 * Create application instance
 * Supports both standalone and cluster modes
 */
async function createApp(options = {}) {
  const { clusterMode = false, workerId = null, skipListen = false } = options;

  // Initialize DI Container
  const container = new DIContainer();
  await container.initialize();

  // Determine HTTP/2 configuration
  const enableHttp2 = process.env.ENABLE_HTTP2 === 'true';
  const fastifyOptions = {
    logger: false,
    bodyLimit: 10485760,
    requestIdHeader: 'x-request-id',
    ajv: {
      customOptions: {
        strict: false,
        keywords: ['example']
      }
    }
  };

  if (enableHttp2) {
    // Load SSL certificates
    const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../certs/server.crt');
    const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '../certs/server.key');

    try {
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        fastifyOptions.http2 = true;
        fastifyOptions.https = {
          allowHTTP1: true, // Fallback support
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };
      } else {
        logger.warn('HTTP/2 enabled but certificates not found, falling back to HTTP/1.1', { certPath, keyPath });
      }
    } catch (err) {
      logger.warn('Failed to load SSL certificates, falling back to HTTP/1.1', { error: err.message });
    }
  }

  // Create Fastify app
  const app = fastify(fastifyOptions);

  // Register plugins
  await app.register(require('@fastify/helmet'));

  // Enable HTTP compression (gzip/brotli)
  await app.register(require('@fastify/compress'), {
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Only compress responses > 1KB
    customTypes: /^text\/|\+json$|\+text$|\+xml$|javascript|css|font|svg/
  });

  // Register OpenAPI documentation (only for logs API)
  await app.register(require('@fastify/swagger'), logsOpenApiConfig);
  await app.register(require('@fastify/swagger-ui'), {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Content parser middleware - handles both JSON and Protocol Buffer formats
  // Pass validation service for worker-based protobuf parsing
  const validationService = container.get('validationService');
  await app.register(createContentParserPlugin(validationService, logger.child({ component: 'ContentParser' })));

  // Request logging hook
  // app.addHook('onRequest', (request, reply, done) => {
  //   const format = request.contentFormat ? ` [${request.contentFormat}]` : '';
  //   const workerInfo = clusterMode ? ` [Worker ${workerId}]` : '';
  //   logger.debug('Incoming request', {
  //      method: request.method,
  //      url: request.url,
  //      format: request.contentFormat,
  //      workerId: clusterMode ? workerId : undefined
  //   });
  //   done();
  // });

  // Setup routes with controllers from DI container
  const controllers = container.getControllers();
  await setupRoutes(app, controllers, logger);

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      success: false,
      message: 'Endpoint not found'
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Unhandled error', { error, url: request.url, method: request.method });
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
        logger.info('HTTP server listening', { workerId, port: HTTP_PORT });
        if (workerId === 1) {
          logger.info('gRPC server listening', { workerId, port: GRPC_PORT });
        }
      } else {
        // Pretty print for development/standalone
        if (process.env.LOG_MODE !== 'json') {
          logger.info(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - Started Successfully           ║
║                  (Fastify Edition)                        ║
╚═══════════════════════════════════════════════════════════╝
 
HTTP Server running on: ${enableHttp2 ? 'https' : 'http'}://localhost:${HTTP_PORT}
gRPC Server running on: 0.0.0.0:${GRPC_PORT}
Environment: ${process.env.NODE_ENV || 'development'}
`);
        } else {
          logger.info('Log Ingestion Platform started', {
            httpPort: HTTP_PORT,
            grpcPort: GRPC_PORT,
            env: process.env.NODE_ENV,
            mode: 'standalone',
            http2: enableHttp2
          });
        }
      }
    } catch (error) {
      logger.error('Failed to start HTTP server', { error: error.message });
      throw error;
    }
  }

  // Start gRPC server (unless skipListen is true)
  // In cluster mode, only start gRPC in worker 1 to avoid port conflicts
  let grpcServer;
  if (!skipListen && (!clusterMode || workerId === 1)) {
    const handlers = container.getHandlers();
    grpcServer = await setupGrpcServer(handlers, GRPC_PORT, logger);
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
        logger.info('Application started successfully', { workerId });
      }
    },

    /**
     * Gracefully shutdown the application
     */
    async shutdown() {
      logger.info('Starting graceful shutdown...');

      return new Promise(async (resolve) => {
        try {
          // Close HTTP server (Fastify app)
          if (app) {
            const closePromise = app.close();
            const timeoutPromise = new Promise(resolve =>
              setTimeout(() => {
                logger.warn('HTTP server close timed out, forcing progress...');
                resolve();
              }, 5000)
            );

            await Promise.race([closePromise, timeoutPromise]);
            logger.info('HTTP server closed');
          }

          // Shutdown gRPC server
          if (grpcServer) {
            await shutdownGrpcServer(grpcServer, logger);
            logger.info('gRPC server closed');
          }

          // Cleanup resources
          await container.cleanup();
          logger.info('Resources cleaned up');

          resolve();
        } catch (error) {
          logger.error('Error during shutdown', { error });
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
      logger.debug('Received message from master', { workerId, type: message.type });
    },

    /**
     * Update configuration (for hot reload)
     */
    updateConfig(config) {
      logger.info('Config update', { workerId, config });
      // Implement config hot-reload if needed
    }
  };
}

const os = require('os');
const numCPUs = os.cpus().length / 2;

// If running directly (not in cluster mode), start the app
if (require.main === module) {
  // Check if clustering is enabled via environment variable
  const isClusterEnabled = process.env.ENABLE_CLUSTERING === 'true';

  if (isClusterEnabled && cluster.isPrimary) {
    logger.info('Master process running', { pid: process.pid, cpus: numCPUs });
    logger.info('Forking workers for maximum throughput...');

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      logger.warn('Worker died', { workerId: worker.process.pid, code, signal });
      cluster.fork();
    });
  } else {
    // Worker Process (or Single Process if clustering disabled)
    (async () => {
      // Determine options based on process type
      const options = cluster.isWorker
        ? { clusterMode: true, workerId: cluster.worker.id }
        : { clusterMode: false };

      // Auto-set WORKER_INSTANCE_ID for cluster workers to ensure unique Redis consumer names
      // cluster.worker.id is stable (1, 2, 3...) and unique across workers
      if (cluster.isWorker && !process.env.WORKER_INSTANCE_ID) {
        process.env.WORKER_INSTANCE_ID = `cluster-${cluster.worker.id}`;
      }

      const appInstance = await createApp(options);

      // Setup signal handlers
      const shutdown = async (signal) => {
        const role = cluster.isWorker ? `Worker ${cluster.worker.id}` : 'App';
        logger.info('Signal received, starting graceful shutdown', { role, signal });

        await appInstance.shutdown();

        if (cluster.isWorker) {
          process.exit(0);
        } else {
          process.exit(0);
        }
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      // Handle uncaught errors
      process.on('uncaughtException', (error) => {
        logger.fatal('Uncaught Exception', { error });
        process.exit(1);
      });

      process.on('unhandledRejection', (reason, promise) => {
        logger.fatal('Unhandled Rejection', { reason });
        process.exit(1);
      });
    })();
  }
}

module.exports = createApp;
