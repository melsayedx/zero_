/**
 * Log Ingestion Service
 * Main service for log ingestion with validation and transformation
 */

const batchProcessor = require('./batch-processor.service');
const logTransformer = require('../transformation/log-transformer.service');
const schemaDetector = require('./schema-detector.service');
const { processLogEntry } = require('../../utils/validator');
const logger = require('../../utils/logger');

class LogIngestionService {
  constructor() {
    this.acceptedLogs = 0;
    this.rejectedLogs = 0;
  }

  /**
   * Initialize ingestion service
   */
  async init() {
    batchProcessor.init();
    logger.info('Log ingestion service initialized');
  }

  /**
   * Ingest single log entry
   * @param {Object} logEntry - Raw log entry
   * @returns {Promise<Object>} Ingestion result
   */
  async ingestLog(logEntry) {
    try {
      // Validate and normalize log entry
      const validatedLog = processLogEntry(logEntry);
      
      // Transform log (apply any custom transformations)
      const transformedLog = await logTransformer.transform(validatedLog);
      
      // Add to batch processor
      await batchProcessor.add(transformedLog);
      
      this.acceptedLogs++;
      
      return {
        status: 'accepted',
        count: 1
      };
    } catch (error) {
      this.rejectedLogs++;
      logger.error('Log ingestion error', { 
        error: error.message,
        log: logEntry 
      });
      
      throw error;
    }
  }

  /**
   * Ingest batch of logs (high-performance bulk ingestion)
   * @param {Array} logs - Array of log entries
   * @returns {Promise<Object>} Ingestion result
   */
  async ingestBatch(logs) {
    const startTime = Date.now();
    const results = {
      accepted: 0,
      rejected: 0,
      errors: []
    };

    try {
      // Process logs in parallel for better performance
      const processedLogs = [];
      
      for (let i = 0; i < logs.length; i++) {
        try {
          // Validate and normalize
          const validatedLog = processLogEntry(logs[i]);
          
          // Transform
          const transformedLog = await logTransformer.transform(validatedLog);
          
          processedLogs.push(transformedLog);
          results.accepted++;
        } catch (error) {
          results.rejected++;
          results.errors.push({
            index: i,
            error: error.message
          });
          
          // Log individual errors at debug level to avoid spam
          logger.debug('Log validation error', { 
            index: i,
            error: error.message 
          });
        }
      }

      // Add all valid logs to batch processor
      if (processedLogs.length > 0) {
        await batchProcessor.addBatch(processedLogs);
        this.acceptedLogs += processedLogs.length;
      }
      
      this.rejectedLogs += results.rejected;
      
      const duration = Date.now() - startTime;
      
      logger.info('Batch ingestion completed', {
        total: logs.length,
        accepted: results.accepted,
        rejected: results.rejected,
        duration
      });

      return {
        status: 'completed',
        total: logs.length,
        accepted: results.accepted,
        rejected: results.rejected,
        duration,
        errors: results.errors.length > 0 ? results.errors.slice(0, 10) : [] // Limit error details
      };
    } catch (error) {
      logger.error('Batch ingestion error', { 
        error: error.message,
        count: logs.length 
      });
      throw error;
    }
  }

  /**
   * Ingest logs with schema detection
   * @param {Array} logs - Array of log entries
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Ingestion result with schema info
   */
  async ingestWithSchemaDetection(logs, serviceName) {
    try {
      // Detect schema from logs
      const detectedSchema = schemaDetector.detectSchema(logs, serviceName);
      
      // Ingest logs
      const result = await this.ingestBatch(logs);
      
      return {
        ...result,
        schema: detectedSchema
      };
    } catch (error) {
      logger.error('Schema detection ingestion error', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get ingestion statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const batchStats = batchProcessor.getStats();
    
    return {
      accepted: this.acceptedLogs,
      rejected: this.rejectedLogs,
      total: this.acceptedLogs + this.rejectedLogs,
      acceptanceRate: this.acceptedLogs + this.rejectedLogs > 0
        ? ((this.acceptedLogs / (this.acceptedLogs + this.rejectedLogs)) * 100).toFixed(2) + '%'
        : '0%',
      batchProcessor: batchStats
    };
  }

  /**
   * Force flush all buffered logs
   * @returns {Promise<Object>} Flush result
   */
  async flush() {
    return batchProcessor.forceFlush();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.acceptedLogs = 0;
    this.rejectedLogs = 0;
    logger.info('Ingestion statistics reset');
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  healthCheck() {
    const stats = this.getStats();
    
    return {
      healthy: true,
      stats
    };
  }
}

module.exports = new LogIngestionService();

