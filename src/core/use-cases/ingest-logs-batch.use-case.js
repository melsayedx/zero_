const LogEntry = require('../entities/log-entry');
const IngestLogPort = require('../ports/ingest-log.port');

/**
 * IngestLogsBatch Use Case
 * Core business logic for ingesting multiple log entries in batch
 * Optimized for high-throughput scenarios
 * 
 * Architecture:
 * - Implements: IngestLogPort (input port) - what the outside world calls
 * - Depends on: LogRepositoryPort (output port) - what this use case needs
 */
class IngestLogsBatchUseCase extends IngestLogPort {
  constructor(logRepository) {
    super(); // Call parent constructor
    
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }
    
    // Validate that the repository implements the port interface
    if (typeof logRepository.saveBatch !== 'function') {
      throw new Error('LogRepository must implement the saveBatch() method from LogRepositoryPort');
    }
    
    this.logRepository = logRepository;
  }

  /**
   * Execute the batch use case
   * @param {Array<Object>} logsData - Array of raw log data
   * @returns {Promise<Object>} Result with success/failure status
   */
  async execute(logsData) {
    try {
      // Validate input
      if (!Array.isArray(logsData)) {
        throw new Error('Input must be an array of log entries');
      }

      if (logsData.length === 0) {
        throw new Error('Cannot process empty batch');
      }

      // Limit batch size to prevent memory issues
      const MAX_BATCH_SIZE = 10000;
      if (logsData.length > MAX_BATCH_SIZE) {
        throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} logs`);
      }

      // Create domain entities (validates each log)
      const logEntries = [];
      const errors = [];

      for (let i = 0; i < logsData.length; i++) {
        try {
          logEntries.push(new LogEntry(logsData[i]));
        } catch (error) {
          errors.push({
            index: i,
            error: error.message,
            data: logsData[i]
          });
        }
      }

      // If all logs failed validation, return error
      if (logEntries.length === 0) {
        return {
          success: false,
          error: 'All log entries failed validation',
          details: errors,
          message: 'Failed to ingest batch'
        };
      }

      // Save via repository port
      const result = await this.logRepository.saveBatch(logEntries);

      return {
        success: true,
        data: {
          inserted: result.inserted,
          app_ids: result.app_ids,
          failed_validations: errors.length
        },
        message: `Batch ingested successfully: ${result.inserted} logs inserted${errors.length > 0 ? `, ${errors.length} failed validation` : ''}`
      };
    } catch (error) {
      // Return business-friendly error
      return {
        success: false,
        error: error.message,
        message: 'Failed to ingest batch'
      };
    }
  }
}

module.exports = IngestLogsBatchUseCase;

