/**
 * Ingest Log Use Case
 * Core business logic for log ingestion
 */

const LogEntry = require('../entities/log-entry');

class IngestLogUseCase {
  constructor(logRepository) {
    this.logRepository = logRepository;
  }

  /**
   * Execute the use case
   * @param {Object} logData - Raw log data
   * @returns {Promise<Object>} Result
   */
  async execute(logData) {
    try {
      // 1. Create domain entity (validates automatically)
      const logEntry = new LogEntry(logData);

      // 2. Persist through repository port
      await this.logRepository.save(logEntry);

      // 3. Return success
      return {
        success: true,
        message: 'Log ingested successfully',
        log: logEntry.toJSON()
      };
    } catch (error) {
      // Business logic error handling
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = IngestLogUseCase;

