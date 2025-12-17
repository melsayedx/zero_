const jwt = require('jsonwebtoken');
const fp = require('fastify-plugin');
const { LoggerFactory } = require('../../infrastructure/logging');

const logger = LoggerFactory.named('AuthMiddleware');

/**
 * JWT Authentication Plugin for Fastify
 * Extracts and verifies JWT token from Authorization header
 */
class AuthMiddleware {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  }

  /**
   * Pre-handler hook for authentication
   * @returns {Function} Fastify pre-handler function
   */
  authenticate() {
    return async (request, reply) => {
      try {
        // Extract token from Authorization header
        const authHeader = request.headers.authorization;

        if (!authHeader) {
          return reply.code(401).send({
            success: false,
            message: 'Authorization header is required'
          });
        }

        // Check if it's a Bearer token
        if (!authHeader.startsWith('Bearer ')) {
          return reply.code(401).send({
            success: false,
            message: 'Invalid authorization format. Use: Bearer <token>'
          });
        }

        // Extract token
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        if (!token) {
          return reply.code(401).send({
            success: false,
            message: 'Token is required'
          });
        }

        // Verify token
        const payload = jwt.verify(token, this.jwtSecret);

        // Attach user info to request
        request.user = {
          user_id: payload.user_id,
          email: payload.email
        };

      } catch (error) {
        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
          return reply.code(401).send({
            success: false,
            message: 'Token has expired'
          });
        }

        if (error.name === 'JsonWebTokenError') {
          return reply.code(401).send({
            success: false,
            message: 'Invalid token'
          });
        }

        // Other errors
        logger.error('Authentication error', { error });
        return reply.code(401).send({
          success: false,
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * Optional authentication - doesn't fail if no token provided
   * Useful for endpoints that work with or without authentication
   * @returns {Function} Fastify pre-handler function
   */
  optionalAuth() {
    return async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          // No token provided, continue without user
          request.user = null;
          return;
        }

        const token = authHeader.substring(7);

        if (!token) {
          request.user = null;
          return;
        }

        // Verify token
        const payload = jwt.verify(token, this.jwtSecret);
        request.user = {
          user_id: payload.user_id,
          email: payload.email
        };

      } catch (error) {
        // If token is invalid, continue without user
        request.user = null;
      }
    };
  }
}

// Export factory function for creating middleware (simplified for now)
function createAuthMiddleware() {
  return {
    authenticate: () => (request, reply, done) => {
      // No authentication for now - just pass through
      done();
    },
    optionalAuth: () => (request, reply, done) => {
      // No authentication for now - just pass through
      request.user = null;
      done();
    }
  };
}

module.exports = createAuthMiddleware;

