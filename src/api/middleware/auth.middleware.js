/**
 * Authentication Middleware
 * JWT-based authentication and API key validation
 */

const jwt = require('jsonwebtoken');
const mongodbService = require('../../services/storage/mongodb.service');
const logger = require('../../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Authenticate JWT token
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await mongodbService.getUser(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid or inactive user'
      });
    }

    // Attach user to request
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired'
      });
    }

    logger.error('Authentication error', { error: error.message });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Authenticate API key
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No API key provided'
      });
    }

    // Find user by API key
    const User = require('../../models/mongodb/user.model');
    const user = await User.findOne({ 'apiKeys.key': apiKey });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    // Update last used timestamp
    const apiKeyObj = user.apiKeys.find(k => k.key === apiKey);
    if (apiKeyObj) {
      apiKeyObj.lastUsed = new Date();
      await user.save();
    }

    // Attach user to request
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    logger.error('API key authentication error', { error: error.message });
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Authenticate either JWT or API key
 */
const authenticate = async (req, res, next) => {
  const hasToken = req.headers['authorization'];
  const hasApiKey = req.headers['x-api-key'];

  if (hasToken) {
    return authenticateToken(req, res, next);
  } else if (hasApiKey) {
    return authenticateApiKey(req, res, next);
  } else {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'No authentication credentials provided'
    });
  }
};

/**
 * Optional authentication (doesn't fail if no auth provided)
 */
const optionalAuth = async (req, res, next) => {
  const hasToken = req.headers['authorization'];
  const hasApiKey = req.headers['x-api-key'];

  if (hasToken || hasApiKey) {
    return authenticate(req, res, next);
  }

  // No authentication provided, continue without user
  req.user = null;
  next();
};

/**
 * Authorize based on role
 * @param {Array<string>} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        user: req.user.username,
        role: req.user.role,
        requiredRoles: roles
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const expiresIn = process.env.JWT_EXPIRATION || '24h';
  
  return jwt.sign(
    {
      userId: user._id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Verify token without middleware
 * @param {string} token - JWT token
 * @returns {Object} Decoded token or null
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticate,
  authenticateToken,
  authenticateApiKey,
  optionalAuth,
  authorize,
  generateToken,
  verifyToken
};

