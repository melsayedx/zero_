const createAuthMiddleware = require('../middleware/auth.middleware');

/**
 * Setup HTTP routes for Fastify
 * @param {FastifyInstance} fastify - Fastify app instance
 * @param {Object} controllers - Object containing controller instances
 */
async function setupRoutes(fastify, controllers) {
  const authMiddleware = createAuthMiddleware();

  // ============================================
  // CORE ROUTES (No MongoDB Required)
  // ============================================

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

  // ============================================
  // LOG INGESTION & RETRIEVAL ROUTES (Simplified)
  // ============================================

  // Ingest logs (no authentication for now)
  fastify.post('/api/logs', {
    preHandler: (request, reply, done) => {
      // Normalize input: if single object, wrap in array
      if (request.body && !Array.isArray(request.body)) {
        request.body = [request.body];
      }
      done();
    },
    schema: {
      body: {
        oneOf: [
          {
            type: 'object',
            required: ['app_id', 'message', 'source'],
            properties: {
              app_id: { type: 'string', maxLength: 100 },
              level: { type: 'string', enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] },
              message: { type: 'string', maxLength: 10000 },
              source: { type: 'string', maxLength: 255 },
              timestamp: { type: 'string', format: 'date-time' },
              metadata: { type: 'object' }
            }
          },
          {
            type: 'array',
            items: {
              type: 'object',
              required: ['app_id', 'message', 'source'],
              properties: {
                app_id: { type: 'string', maxLength: 100 },
                level: { type: 'string', enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] },
                message: { type: 'string', maxLength: 10000 },
                source: { type: 'string', maxLength: 255 },
                timestamp: { type: 'string', format: 'date-time' },
                metadata: { type: 'object' }
              }
            }
          }
        ]
      },
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
  }, async (request, reply) => await controllers.ingestLogController.handle(request, reply));

  // Retrieve logs by app_id (no authentication for now)
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



