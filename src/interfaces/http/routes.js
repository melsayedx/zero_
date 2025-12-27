const { createIdempotencyMiddleware, createIdempotencyHook } = require('../middleware/idempotency.middleware');


/**
 * Setup HTTP routes for Fastify
 * @param {FastifyInstance} fastify - Fastify app instance
 * @param {Object} controllers - Object containing controller instances
 * @param {Object} rootLogger - Application logger instance
 */
async function setupRoutes(fastify, controllers, rootLogger) {
  const logger = rootLogger.child({ component: 'Routes' });

  // Create idempotency middleware if store is available
  let idempotencyMiddleware = null;
  let idempotencyHook = null;
  if (controllers.idempotencyStore) {
    idempotencyMiddleware = createIdempotencyMiddleware(controllers.idempotencyStore, {
      enableLogging: process.env.ENABLE_IDEMPOTENCY_LOGGING === 'true',
      logger: rootLogger
    });
    idempotencyHook = createIdempotencyHook(controllers.idempotencyStore, {
      enableLogging: process.env.ENABLE_IDEMPOTENCY_LOGGING === 'true',
      logger: rootLogger
    });
  }

  // =================================
  // CORE ROUTES
  // =================================

  // Health check endpoint
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                latency: { type: 'number' },
                pingLatency: { type: 'number' },
                version: { type: 'string' }
              }
            }
          }
        },
        503: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                timestamp: { type: 'string' },
                latency: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.healthCheckController.handle(request, reply));

  // Stats endpoint (includes batch buffer metrics)
  fastify.get('/api/stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.statsController.handle(request, reply));

  // =============================================
  // LOG INGESTION & RETRIEVAL ROUTES
  // =============================================

  // Ingest logs (with optional idempotency support)
  // Send Idempotency-Key header to prevent duplicate processing
  const ingestRouteOptions = {
    schema: {
      body: {}, // Validation temporarily disabled for performance (handled by ValidationService)
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            stats: {
              type: 'object',
              properties: {
                accepted: { type: 'number' },
                rejected: { type: 'number' },
                throughput: { type: 'string' },
                validationStrategy: { type: 'string' },
                workerThreads: { type: 'boolean' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            errors: { type: 'array' }
          }
        }
      }
    }
  };

  // Add idempotency handlers if available
  if (idempotencyMiddleware) {
    ingestRouteOptions.preHandler = idempotencyMiddleware;
    ingestRouteOptions.onSend = idempotencyHook;
  }

  fastify.post('/api/logs', ingestRouteOptions,
    async (request, reply) => await controllers.ingestLogController.handle(request, reply));

  // Retrieve logs by app_id
  fastify.get('/api/logs/:app_id', {
    schema: {
      params: {
        type: 'object',
        required: ['app_id'],
        properties: {
          app_id: { type: 'string', maxLength: 100 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 10000, default: 1000 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.getLogsByAppIdController.handle(request, reply));
}

module.exports = setupRoutes;
