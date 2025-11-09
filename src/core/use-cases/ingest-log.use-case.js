const LogEntry = require('../entities/log-entry');

/**
 * IngestLog Use Case
 * Core business logic for ingesting a log entry
 */
class IngestLogUseCase {
  constructor(logRepository) {
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }
    this.logRepository = logRepository;
  }

  /**
   * Execute the use case
   * @param {Object} logData - Raw log data
   * @returns {Promise<Object>} Result with success/failure status
   */
  async execute(logData) {
    try {
      // Create domain entity (validates data)
      const logEntry = new LogEntry(logData);

      // Save via repository port
      const result = await this.logRepository.save(logEntry);

      return {
        success: true,
        data: result,
        message: 'Log entry ingested successfully'
      };
    } catch (error) {
      // Return business-friendly error
      return {
        success: false,
        error: error.message,
        message: 'Failed to ingest log entry'
      };
    }
  }
}

module.exports = IngestLogUseCase;

