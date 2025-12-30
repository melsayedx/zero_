const { createIdempotencyCheck, createIdempotencyHook } = require('../hooks/idempotency.hooks');
const logsOpenApiConfig = require('./schemas/logs-openapi');


/**
 * Setups HTTP routes.
 * @param {FastifyInstance} fastify - App instance.
 * @param {Object} controllers - Controllers.
 * @param {Object} rootLogger - Logger.
 */
async function setupRoutes(fastify, controllers, rootLogger) {
  const logger = rootLogger.child({ component: 'Routes' });

  // Redirect root to OpenAPI UI
  fastify.get('/', async (request, reply) => {
    return reply.code(308).redirect('/api/docs');
  });

  const idempotencyCheck = createIdempotencyCheck(
    controllers.idempotencyStore,
    rootLogger.child({ component: 'IdempotencyCheck' }),
    {
      enforce: process.env.ENFORCE_IDEMPOTENCY === 'true'
    }
  );

  const idempotencyHook = createIdempotencyHook(
    controllers.idempotencyStore,
    rootLogger.child({ component: 'IdempotencyHook' })
  );

  const ingestRouteOptions = {
    schema: {
      body: {}, // Validation is disabled for performance (handled by ValidationService)
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
                throughput: { type: 'string' }
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
    },
    preHandler: idempotencyCheck,
    onSend: idempotencyHook
  };

  fastify.post('/api/logs', ingestRouteOptions,
    async (request, reply) => await controllers.ingestLogController.handle(request, reply));

  const semanticSearchRouteOptions = {
    schema: {
      summary: 'Semantic Search',
      description: 'Search logs using natural language queries powered by vector embeddings',
      tags: ['logs'],
      body: logsOpenApiConfig.openapi.components.schemas.SemanticSearchRequest,
      response: {
        200: {
          description: 'Successful search results',
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Found 15 similar logs'
            },
            data: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The processed search query'
                },
                logs: {
                  type: 'array',
                  items: logsOpenApiConfig.openapi.components.schemas.LogEntry,
                  description: 'List of logs matching the semantic query'
                },
                metadata: {
                  type: 'object',
                  description: 'Search metadata (execution time, model used, etc.)'
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid request',
          ...logsOpenApiConfig.openapi.components.schemas.BadRequestResponse
        },
        500: {
          description: 'Server error',
          ...logsOpenApiConfig.openapi.components.schemas.ErrorResponse
        }
      }
    },
    preHandler: idempotencyCheck,
    onSend: idempotencyHook
  };

  fastify.post('/api/logs/search', semanticSearchRouteOptions, async (request, reply) => await controllers.semanticSearchController.handle(request, reply));

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
  }, async (request, reply) => await controllers.logRetrievalController.handle(request, reply));

}

module.exports = setupRoutes;

