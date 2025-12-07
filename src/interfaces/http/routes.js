const createAuthMiddleware = require('../middleware/auth.middleware');

// Shared schema for a single log entry
const logEntrySchema = {
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
};

/**
 * Setup HTTP routes for Fastify
 * @param {FastifyInstance} fastify - Fastify app instance
 * @param {Object} controllers - Object containing controller instances
 */
async function setupRoutes(fastify, controllers) {
  const authMiddleware = createAuthMiddleware();

  // =================================
  // CORE ROUTES (No MongoDB Required)
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
  // LOG INGESTION & RETRIEVAL ROUTES (Simplified)
  // =============================================

  // Ingest logs (no authentication for now)
  fastify.post('/api/logs', {
    schema: {
      body: {
        oneOf: [
          logEntrySchema,
          { type: 'array', items: logEntrySchema }
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

  // ============================================
  // ORGANIZATION & TEAM MANAGEMENT ROUTES (MongoDB Required)
  // ============================================

  // Only add these routes if the required controllers are available
  if (controllers.createOrganizationController && controllers.listOrganizationsController &&
    controllers.createTeamController && controllers.listTeamsController &&
    controllers.createAppController && controllers.listAppsController &&
    controllers.getAppController) {

    // Organization routes
    fastify.post('/api/organizations', {
      preHandler: authMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['org_name'],
          properties: {
            org_name: { type: 'string', minLength: 2, maxLength: 100 }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              organization: { type: 'object' },
              message: { type: 'string' }
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
    }, async (request, reply) => await controllers.createOrganizationController.handle(request, reply));

    fastify.get('/api/organizations', {
      preHandler: authMiddleware,
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              organizations: { type: 'array' },
              message: { type: 'string' }
            }
          }
        }
      }
    }, async (request, reply) => await controllers.listOrganizationsController.handle(request, reply));

    // Team routes
    fastify.post('/api/teams', {
      preHandler: authMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['team_name', 'org_id'],
          properties: {
            team_name: { type: 'string', minLength: 2, maxLength: 100 },
            org_id: { type: 'string' }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              team: { type: 'object' },
              message: { type: 'string' }
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
    }, async (request, reply) => await controllers.createTeamController.handle(request, reply));

    fastify.get('/api/organizations/:org_id/teams', {
      preHandler: authMiddleware,
      schema: {
        params: {
          type: 'object',
          required: ['org_id'],
          properties: {
            org_id: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              teams: { type: 'array' },
              message: { type: 'string' }
            }
          }
        }
      }
    }, async (request, reply) => await controllers.listTeamsController.handle(request, reply));

    // App routes
    fastify.post('/api/apps', {
      preHandler: authMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['app_name', 'org_id'],
          properties: {
            app_name: { type: 'string', minLength: 1, maxLength: 100 },
            org_id: { type: 'string' }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              app: { type: 'object' },
              message: { type: 'string' }
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
    }, async (request, reply) => await controllers.createAppController.handle(request, reply));

    fastify.get('/api/organizations/:org_id/apps', {
      preHandler: authMiddleware,
      schema: {
        params: {
          type: 'object',
          required: ['org_id'],
          properties: {
            org_id: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              apps: { type: 'array' },
              count: { type: 'number' },
              message: { type: 'string' }
            }
          }
        }
      }
    }, async (request, reply) => await controllers.listAppsController.handle(request, reply));

    fastify.get('/api/apps/:app_id', {
      preHandler: authMiddleware,
      schema: {
        params: {
          type: 'object',
          required: ['app_id'],
          properties: {
            app_id: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              app: { type: 'object' },
              message: { type: 'string' }
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    }, async (request, reply) => await controllers.getAppController.handle(request, reply));
  } else {
    console.warn('[Routes] MongoDB-dependent controllers not available, skipping organization/team/app routes');
  }
}

module.exports = setupRoutes;



