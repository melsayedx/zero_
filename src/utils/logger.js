/**
 * Logging Utility
 * High-performance logger using Pino for structured logging
 */

const pino = require('pino');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Configure Pino logger with optimal settings for production
 */
const logger = pino({
  level: LOG_LEVEL,
  
  // Disable pretty printing in production for better performance
  ...(NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  }),

  // Production settings
  ...(NODE_ENV === 'production' && {
    formatters: {
      level: (label) => {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err
    }
  }),

  // Base fields to include in all logs
  base: {
    env: NODE_ENV,
    service: 'log-ingestion-platform'
  }
});

/**
 * Create a child logger with additional context
 * @param {Object} bindings - Additional context to bind to child logger
 * @returns {Object} Child logger instance
 */
logger.child = (bindings) => {
  return logger.child(bindings);
};

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
logger.perf = (operation, duration, metadata = {}) => {
  logger.info({
    type: 'performance',
    operation,
    duration,
    ...metadata
  }, `${operation} completed in ${duration}ms`);
};

/**
 * Log database queries
 * @param {string} database - Database name
 * @param {string} operation - Operation type
 * @param {number} duration - Query duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
logger.query = (database, operation, duration, metadata = {}) => {
  logger.debug({
    type: 'database',
    database,
    operation,
    duration,
    ...metadata
  }, `${database} ${operation} - ${duration}ms`);
};

/**
 * Log HTTP requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
logger.http = (req, res, duration) => {
  logger.info({
    type: 'http',
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, `${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
};

/**
 * Log ingestion metrics
 * @param {number} count - Number of logs ingested
 * @param {number} duration - Processing duration
 * @param {Object} metadata - Additional metadata
 */
logger.ingestion = (count, duration, metadata = {}) => {
  const rate = Math.round((count / duration) * 1000);
  logger.info({
    type: 'ingestion',
    count,
    duration,
    rate,
    ...metadata
  }, `Ingested ${count} logs in ${duration}ms (${rate} logs/sec)`);
};

module.exports = logger;

