/**
 * Validation Utility
 * Provides validation functions and schemas for log data
 */

const Joi = require('joi');
const { z } = require('zod');

/**
 * Log levels enum
 */
const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * Joi schema for log entry validation
 */
const logEntrySchema = Joi.object({
  timestamp: Joi.alternatives().try(
    Joi.date(),
    Joi.string().isoDate(),
    Joi.number()
  ).default(() => new Date()),
  
  level: Joi.string()
    .uppercase()
    .valid(...LOG_LEVELS)
    .required(),
  
  message: Joi.string()
    .min(1)
    .max(10000)
    .required(),
  
  service: Joi.string()
    .min(1)
    .max(100)
    .required(),
  
  metadata: Joi.object()
    .pattern(Joi.string(), Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean()
    ))
    .default({}),
  
  source: Joi.object({
    host: Joi.string().max(255),
    environment: Joi.string().max(50).default('production')
  }).default({})
}).options({ stripUnknown: true });

/**
 * Joi schema for batch log ingestion
 */
const batchLogSchema = Joi.object({
  logs: Joi.array()
    .items(logEntrySchema)
    .min(1)
    .max(50000)
    .required()
});

/**
 * Joi schema for query parameters
 */
const queryLogsSchema = Joi.object({
  timeRange: Joi.object({
    start: Joi.alternatives().try(
      Joi.date(),
      Joi.string().isoDate()
    ).required(),
    end: Joi.alternatives().try(
      Joi.date(),
      Joi.string().isoDate()
    ).required()
  }).required(),
  
  service: Joi.string().max(100),
  
  level: Joi.string()
    .uppercase()
    .valid(...LOG_LEVELS),
  
  search: Joi.string().max(500),
  
  host: Joi.string().max(255),
  
  environment: Joi.string().max(50),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .default(100),
  
  offset: Joi.number()
    .integer()
    .min(0)
    .default(0),
  
  sortBy: Joi.string()
    .valid('timestamp', 'level')
    .default('timestamp'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});

/**
 * Zod schema for log entry (alternative validator)
 */
const zodLogEntrySchema = z.object({
  timestamp: z.union([z.date(), z.string().datetime(), z.number()]).default(() => new Date()),
  level: z.enum(LOG_LEVELS),
  message: z.string().min(1).max(10000),
  service: z.string().min(1).max(100),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  source: z.object({
    host: z.string().max(255).optional(),
    environment: z.string().max(50).default('production')
  }).default({})
});

/**
 * Validate log entry
 * @param {Object} logEntry - Log entry to validate
 * @returns {Object} Validation result { error, value }
 */
const validateLogEntry = (logEntry) => {
  return logEntrySchema.validate(logEntry);
};

/**
 * Validate batch of logs
 * @param {Array} logs - Array of log entries
 * @returns {Object} Validation result { error, value }
 */
const validateBatchLogs = (logs) => {
  return batchLogSchema.validate({ logs });
};

/**
 * Validate query parameters
 * @param {Object} queryParams - Query parameters
 * @returns {Object} Validation result { error, value }
 */
const validateQuery = (queryParams) => {
  return queryLogsSchema.validate(queryParams);
};

/**
 * Normalize timestamp to ISO string
 * @param {Date|string|number} timestamp - Timestamp in various formats
 * @returns {string} ISO timestamp string
 */
const normalizeTimestamp = (timestamp) => {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  
  if (typeof timestamp === 'number') {
    // Assume milliseconds if > 10 digits, otherwise seconds
    const date = timestamp > 9999999999 
      ? new Date(timestamp) 
      : new Date(timestamp * 1000);
    return date.toISOString();
  }
  
  if (typeof timestamp === 'string') {
    return new Date(timestamp).toISOString();
  }
  
  return new Date().toISOString();
};

/**
 * Sanitize log message to prevent injection
 * @param {string} message - Log message
 * @returns {string} Sanitized message
 */
const sanitizeMessage = (message) => {
  if (typeof message !== 'string') {
    return String(message);
  }
  
  // Remove control characters except newlines and tabs
  return message.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Validate and normalize log entry
 * @param {Object} logEntry - Raw log entry
 * @returns {Object} Validated and normalized log entry
 * @throws {Error} If validation fails
 */
const processLogEntry = (logEntry) => {
  const { error, value } = validateLogEntry(logEntry);
  
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }
  
  return {
    ...value,
    timestamp: normalizeTimestamp(value.timestamp),
    message: sanitizeMessage(value.message),
    level: value.level.toUpperCase()
  };
};

/**
 * Check if object is a valid log entry
 * @param {any} obj - Object to check
 * @returns {boolean} True if valid log entry
 */
const isValidLogEntry = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  const { error } = logEntrySchema.validate(obj);
  return !error;
};

module.exports = {
  LOG_LEVELS,
  logEntrySchema,
  batchLogSchema,
  queryLogsSchema,
  zodLogEntrySchema,
  validateLogEntry,
  validateBatchLogs,
  validateQuery,
  normalizeTimestamp,
  sanitizeMessage,
  processLogEntry,
  isValidLogEntry
};

