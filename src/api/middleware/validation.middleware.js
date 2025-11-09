/**
 * Validation Middleware
 * Request validation using express-validator
 */

const { body, query, validationResult } = require('express-validator');
const { LOG_LEVELS } = require('../../utils/validator');
const logger = require('../../utils/logger');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation error', {
      path: req.path,
      errors: errors.array()
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  next();
};

/**
 * Validate single log entry
 */
const validateLogEntry = [
  body('timestamp')
    .optional()
    .custom((value) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .withMessage('Invalid timestamp format'),
  
  body('level')
    .notEmpty()
    .withMessage('Level is required')
    .isIn(LOG_LEVELS)
    .withMessage(`Level must be one of: ${LOG_LEVELS.join(', ')}`),
  
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isString()
    .withMessage('Message must be a string')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message must be between 1 and 10000 characters'),
  
  body('service')
    .notEmpty()
    .withMessage('Service is required')
    .isString()
    .withMessage('Service must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Service name must be between 1 and 100 characters'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  
  body('source')
    .optional()
    .isObject()
    .withMessage('Source must be an object'),
  
  body('source.host')
    .optional()
    .isString()
    .withMessage('Host must be a string'),
  
  body('source.environment')
    .optional()
    .isString()
    .withMessage('Environment must be a string'),
  
  handleValidationErrors
];

/**
 * Validate batch log ingestion
 */
const validateBatchLogs = [
  body('logs')
    .isArray({ min: 1, max: 50000 })
    .withMessage('Logs must be an array with 1-50000 entries'),
  
  body('logs.*.level')
    .notEmpty()
    .withMessage('Level is required for all logs')
    .isIn(LOG_LEVELS)
    .withMessage(`Level must be one of: ${LOG_LEVELS.join(', ')}`),
  
  body('logs.*.message')
    .notEmpty()
    .withMessage('Message is required for all logs')
    .isString()
    .withMessage('Message must be a string'),
  
  body('logs.*.service')
    .notEmpty()
    .withMessage('Service is required for all logs')
    .isString()
    .withMessage('Service must be a string'),
  
  handleValidationErrors
];

/**
 * Validate query parameters
 */
const validateQuery = [
  body('timeRange')
    .notEmpty()
    .withMessage('Time range is required')
    .isObject()
    .withMessage('Time range must be an object'),
  
  body('timeRange.start')
    .notEmpty()
    .withMessage('Start time is required')
    .custom((value) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .withMessage('Invalid start time format'),
  
  body('timeRange.end')
    .notEmpty()
    .withMessage('End time is required')
    .custom((value) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .withMessage('Invalid end time format'),
  
  body('service')
    .optional()
    .isString()
    .withMessage('Service must be a string'),
  
  body('level')
    .optional()
    .isIn(LOG_LEVELS)
    .withMessage(`Level must be one of: ${LOG_LEVELS.join(', ')}`),
  
  body('search')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Search term must be less than 500 characters'),
  
  body('limit')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Limit must be between 1 and 10000'),
  
  body('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  
  handleValidationErrors
];

/**
 * Validate dashboard creation
 */
const validateDashboard = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  
  body('widgets')
    .optional()
    .isArray()
    .withMessage('Widgets must be an array'),
  
  body('timeRange')
    .optional()
    .isIn(['15m', '1h', '6h', '24h', '7d', '30d', 'custom'])
    .withMessage('Invalid time range'),
  
  handleValidationErrors
];

/**
 * Validate schema registration
 */
const validateSchema = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  
  body('version')
    .optional()
    .isString()
    .matches(/^\d+\.\d+\.\d+$/)
    .withMessage('Version must be in semver format (e.g., 1.0.0)'),
  
  body('fields')
    .isArray({ min: 1 })
    .withMessage('Fields must be an array with at least one field'),
  
  body('fields.*.name')
    .notEmpty()
    .withMessage('Field name is required'),
  
  body('fields.*.type')
    .notEmpty()
    .withMessage('Field type is required')
    .isIn(['string', 'number', 'boolean', 'date', 'object', 'array'])
    .withMessage('Invalid field type'),
  
  handleValidationErrors
];

/**
 * Validate pagination parameters
 */
const validatePagination = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  
  query('skip')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Skip must be non-negative'),
  
  handleValidationErrors
];

/**
 * Validate ID parameter
 */
const validateId = [
  query('id')
    .optional()
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  handleValidationErrors
];

module.exports = {
  validateLogEntry,
  validateBatchLogs,
  validateQuery,
  validateDashboard,
  validateSchema,
  validatePagination,
  validateId,
  handleValidationErrors
};

