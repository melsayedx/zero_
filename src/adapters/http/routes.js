const createAuthMiddleware = require('../middleware/auth.middleware');

/**
 * Setup HTTP routes for Fastify
 * @param {FastifyInstance} fastify - Fastify app instance
 * @param {Object} controllers - Object containing controller instances
 */
async function setupRoutes(fastify, controllers) {
  const authMiddleware = createAuthMiddleware();

  // ============================================
  // PUBLIC ROUTES (No Authentication Required)
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
  // AUTHENTICATION ROUTES
  // ============================================

  // Register new user
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 255 },
          password: { type: 'string', minLength: 6, maxLength: 255 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.registerController.handle(request, reply));

  // Login user (get JWT token)
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 255 },
          password: { type: 'string', minLength: 6, maxLength: 255 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    user_id: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.loginController.handle(request, reply));

  // Get current user info (protected)
  fastify.get('/api/auth/me', {
    preHandler: authMiddleware.authenticate(),
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                user_id: { type: 'string' },
                email: { type: 'string' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.meController.handle(request, reply));

  // ============================================
  // APP MANAGEMENT ROUTES (Protected)
  // ============================================

  // Create new app
  fastify.post('/api/apps', {
    preHandler: authMiddleware.authenticate(),
    schema: {
      body: {
        type: 'object',
        required: ['app_name'],
        properties: {
          app_name: { type: 'string', minLength: 1, maxLength: 100 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                app_id: { type: 'string' },
                app_name: { type: 'string' },
                owner_user_id: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.createAppController.handle(request, reply));

  // List user's apps
  fastify.get('/api/apps', {
    preHandler: authMiddleware.authenticate(),
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            apps: { type: 'array' },
            count: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => await controllers.listAppsController.handle(request, reply));

  // Get specific app
  fastify.get('/api/apps/:app_id', {
    preHandler: authMiddleware.authenticate(),
    schema: {
      params: {
        type: 'object',
        required: ['app_id'],
        properties: {
          app_id: { type: 'string', maxLength: 100 }
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

  // ============================================
  // LOG INGESTION & RETRIEVAL ROUTES (Protected)
  // ============================================

  // Ingest logs (requires authentication and app ownership verification)
  fastify.post('/api/logs', {
    preHandler: [
      authMiddleware.authenticate(),
      async (request, reply) => {
        try {
          // Verify app ownership before ingesting
          const { app_id } = request.body;

          if (!app_id) {
            return reply.code(400).send({
              success: false,
              message: 'app_id is required in request body'
            });
          }

          const verifyResult = await controllers.verifyAppAccessUseCase.execute({
            app_id,
            user_id: request.user.user_id
          });

          if (!verifyResult.success || !verifyResult.hasAccess) {
            return reply.code(403).send({
              success: false,
              message: 'You do not have access to this app'
            });
          }
        } catch (error) {
          console.error('[Routes] Error verifying app access:', error);
          return reply.code(500).send({
            success: false,
            message: 'Failed to verify app access'
          });
        }
      }
    ],
    schema: {
      body: {
        type: 'array',
        items: {
          type: 'object',
          required: ['app_id', 'message', 'source'],
          properties: {
            app_id: { type: 'string', maxLength: 100 },
            level: { type: 'string', enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'], default: 'INFO' },
            message: { type: 'string', maxLength: 10000 },
            source: { type: 'string', maxLength: 255 },
            timestamp: { type: 'string', format: 'date-time' },
            metadata: { type: 'object' }
          }
        }
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

  // Retrieve logs by app_id (requires authentication and app ownership verification)
  fastify.get('/api/logs/:app_id', {
    preHandler: [
      authMiddleware.authenticate(),
      async (request, reply) => {
        try {
          // Verify app ownership before retrieving
          const { app_id } = request.params;

          const verifyResult = await controllers.verifyAppAccessUseCase.execute({
            app_id,
            user_id: request.user.user_id
          });

          if (!verifyResult.success || !verifyResult.hasAccess) {
            return reply.code(403).send({
              success: false,
              message: 'You do not have access to this app'
            });
          }
        } catch (error) {
          console.error('[Routes] Error verifying app access:', error);
          return reply.code(500).send({
            success: false,
            message: 'Failed to verify app access'
          });
        }
      }
    ],
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

