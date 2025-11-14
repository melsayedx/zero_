const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware for Express
 * Extracts and verifies JWT token from Authorization header
 */
class AuthMiddleware {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  }

  /**
   * Middleware function to authenticate requests
   * @returns {Function} Express middleware function
   */
  authenticate() {
    return async (req, res, next) => {
      try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
          return res.status(401).json({
            success: false,
            message: 'Authorization header is required'
          });
        }

        // Check if it's a Bearer token
        if (!authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            message: 'Invalid authorization format. Use: Bearer <token>'
          });
        }

        // Extract token
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        if (!token) {
          return res.status(401).json({
            success: false,
            message: 'Token is required'
          });
        }

        // Verify token
        const payload = jwt.verify(token, this.jwtSecret);

        // Attach user info to request
        req.user = {
          user_id: payload.user_id,
          email: payload.email
        };

        // Continue to next middleware/controller
        next();

      } catch (error) {
        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            message: 'Token has expired'
          });
        }

        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({
            success: false,
            message: 'Invalid token'
          });
        }

        // Other errors
        console.error('[AuthMiddleware] Error:', error);
        return res.status(401).json({
          success: false,
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * Optional authentication - doesn't fail if no token provided
   * Useful for endpoints that work with or without authentication
   * @returns {Function} Express middleware function
   */
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          // No token provided, continue without user
          req.user = null;
          return next();
        }

        const token = authHeader.substring(7);
        
        if (!token) {
          req.user = null;
          return next();
        }

        // Verify token
        const payload = jwt.verify(token, this.jwtSecret);
        req.user = {
          user_id: payload.user_id,
          email: payload.email
        };

        next();

      } catch (error) {
        // If token is invalid, continue without user
        req.user = null;
        next();
      }
    };
  }
}

// Export factory function for creating middleware
function createAuthMiddleware() {
  const middleware = new AuthMiddleware();
  return {
    authenticate: middleware.authenticate.bind(middleware),
    optionalAuth: middleware.optionalAuth.bind(middleware)
  };
}

module.exports = createAuthMiddleware;

