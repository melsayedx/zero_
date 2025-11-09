/**
 * Error Handling Middleware
 * Global error handler and custom error classes
 */

const logger = require('../../utils/logger');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500);
    this.name = 'InternalError';
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Not found middleware (404)
 */
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.path}`);
  next(error);
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Log error
  if (error.isOperational) {
    logger.warn('Operational error', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method
    });
  } else {
    logger.error('Unexpected error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
  }

  // Handle specific error types
  if (error.name === 'ValidationError' && !error.statusCode) {
    error = new ValidationError(error.message, error.details);
  }

  if (error.name === 'CastError') {
    error = new ValidationError(`Invalid ${error.path}: ${error.value}`);
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    error = new ConflictError(`Duplicate value for field: ${field}`);
  }

  if (error.name === 'JsonWebTokenError') {
    error = new AuthenticationError('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    error = new AuthenticationError('Token expired');
  }

  // MongoDB errors
  if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    error = new InternalError('Database error occurred');
  }

  // ClickHouse errors
  if (error.message && error.message.includes('ClickHouse')) {
    error = new InternalError('Database query error');
  }

  // Set default error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Error response
  const response = {
    error: error.name || 'Error',
    message: message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      path: req.path,
      method: req.method
    })
  };

  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle process exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    });
    
    // Give logger time to write, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason,
      promise: promise
    });
  });
};

/**
 * Initialize error handlers
 */
const initializeErrorHandlers = () => {
  handleUncaughtException();
  handleUnhandledRejection();
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  
  // Middleware
  notFound,
  errorHandler,
  asyncHandler,
  
  // Initialization
  initializeErrorHandlers
};

