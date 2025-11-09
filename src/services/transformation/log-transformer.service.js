/**
 * Log Transformer Service
 * Transforms and enriches log data before storage
 */

const logger = require('../../utils/logger');

class LogTransformerService {
  constructor() {
    this.transformations = new Map();
    this.enrichers = [];
  }

  /**
   * Register custom transformation for a service
   * @param {string} serviceName - Service name
   * @param {Function} transformer - Transformation function
   */
  registerTransformation(serviceName, transformer) {
    this.transformations.set(serviceName, transformer);
    logger.info('Transformation registered', { service: serviceName });
  }

  /**
   * Register enricher (applies to all logs)
   * @param {Function} enricher - Enrichment function
   */
  registerEnricher(enricher) {
    this.enrichers.push(enricher);
    logger.info('Enricher registered');
  }

  /**
   * Transform log entry
   * @param {Object} log - Log entry to transform
   * @returns {Promise<Object>} Transformed log
   */
  async transform(log) {
    try {
      let transformedLog = { ...log };

      // Apply service-specific transformation
      if (log.service && this.transformations.has(log.service)) {
        const transformer = this.transformations.get(log.service);
        transformedLog = await transformer(transformedLog);
      }

      // Apply enrichers
      for (const enricher of this.enrichers) {
        transformedLog = await enricher(transformedLog);
      }

      // Apply standard transformations
      transformedLog = this.applyStandardTransformations(transformedLog);

      return transformedLog;
    } catch (error) {
      logger.error('Log transformation error', { 
        error: error.message,
        log 
      });
      
      // Return original log if transformation fails
      return log;
    }
  }

  /**
   * Apply standard transformations
   * @param {Object} log - Log entry
   * @returns {Object} Transformed log
   */
  applyStandardTransformations(log) {
    const transformed = { ...log };

    // Ensure timestamp is ISO string
    if (transformed.timestamp) {
      if (!(transformed.timestamp instanceof Date)) {
        transformed.timestamp = new Date(transformed.timestamp).toISOString();
      } else {
        transformed.timestamp = transformed.timestamp.toISOString();
      }
    }

    // Flatten nested metadata
    if (transformed.metadata && typeof transformed.metadata === 'object') {
      transformed.metadata = this.flattenObject(transformed.metadata);
    }

    // Add processing timestamp
    transformed._ingestion_time = new Date().toISOString();

    // Truncate very long messages
    if (transformed.message && transformed.message.length > 10000) {
      transformed.message = transformed.message.substring(0, 10000) + '... [truncated]';
      transformed._truncated = true;
    }

    return transformed;
  }

  /**
   * Flatten nested object to single level with dot notation
   * @param {Object} obj - Object to flatten
   * @param {string} prefix - Key prefix
   * @returns {Object} Flattened object
   */
  flattenObject(obj, prefix = '') {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively flatten nested objects
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        // Convert to string for ClickHouse Map type
        flattened[newKey] = String(value);
      }
    }

    return flattened;
  }

  /**
   * Transform batch of logs
   * @param {Array} logs - Array of log entries
   * @returns {Promise<Array>} Transformed logs
   */
  async transformBatch(logs) {
    const transformedLogs = [];

    for (const log of logs) {
      try {
        const transformed = await this.transform(log);
        transformedLogs.push(transformed);
      } catch (error) {
        logger.error('Batch transformation error', { 
          error: error.message 
        });
        // Include original log if transformation fails
        transformedLogs.push(log);
      }
    }

    return transformedLogs;
  }

  /**
   * Clear all transformations
   */
  clearTransformations() {
    this.transformations.clear();
    this.enrichers = [];
    logger.info('All transformations cleared');
  }

  /**
   * Remove transformation for service
   * @param {string} serviceName - Service name
   */
  removeTransformation(serviceName) {
    this.transformations.delete(serviceName);
    logger.info('Transformation removed', { service: serviceName });
  }

  /**
   * Get registered transformations
   * @returns {Array} List of registered services
   */
  getRegisteredTransformations() {
    return Array.from(this.transformations.keys());
  }
}

// Create singleton instance
const transformerService = new LogTransformerService();

// Register default enrichers

// Add hostname if not present
transformerService.registerEnricher(async (log) => {
  if (!log.source) {
    log.source = {};
  }
  if (!log.source.host) {
    log.source.host = require('os').hostname();
  }
  return log;
});

// Add environment from ENV if not present
transformerService.registerEnricher(async (log) => {
  if (!log.source) {
    log.source = {};
  }
  if (!log.source.environment) {
    log.source.environment = process.env.NODE_ENV || 'production';
  }
  return log;
});

module.exports = transformerService;

