const LogEntry = require('../entities/log-entry');
const IngestLogPort = require('../ports/ingest-log.port');

/**
 * IngestLog Use Case
 * Core business logic for ingesting a log entry
 * 
 * Architecture:
 * - Implements: IngestLogPort (input port) - what the outside world calls
 * - Depends on: LogRepositoryPort (output port) - what this use case needs
 * 
 * This follows the Dependency Inversion Principle and Hexagonal Architecture
 */
class IngestLogUseCase extends IngestLogPort {
  constructor(logRepository) {
    super(); // Call parent constructor
    
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }
    
    // Validate that the repository implements the port interface
    if (typeof logRepository.save !== 'function') {
      throw new Error('LogRepository must implement the save() method from LogRepositoryPort');
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

