const LogRepositoryPort = require('../ports/log-repository.port');

/**
 * GetLogsByAppId Use Case
 * Core business logic for retrieving logs by application ID
 * 
 * Architecture:
 * - Depends on: LogRepositoryPort (output port) - what this use case needs
 * 
 * This follows the Dependency Inversion Principle and Hexagonal Architecture
 */
class GetLogsByAppIdUseCase {
  constructor(logRepository) {
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }
    
    // Validate that the repository implements the port interface
    if (typeof logRepository.findBy !== 'function') {
      throw new Error('LogRepository must implement the findBy() method from LogRepositoryPort');
    }
    
    this.logRepository = logRepository;
  }

  /**
   * Execute the use case
   * @param {string} appId - Application ID to filter by
   * @param {number} limit - Maximum number of logs to return (default: 1000)
   * @returns {Promise<Object>} Result with success/failure status and logs
   */
  async execute(appId, limit = 1000) {
    try {
      // Validate app_id
      if (!appId || typeof appId !== 'string') {
        return {
          success: false,
          error: 'app_id is required and must be a string',
          message: 'Invalid app_id provided'
        };
      }

      // Validate limit
      if (limit < 1 || limit > 10000) {
        return {
          success: false,
          error: 'Limit must be between 1 and 10000',
          message: 'Invalid limit provided'
        };
      }

      // Query logs via repository port
      const result = await this.logRepository.findBy({
        filter: { app_id: appId },
        limit: limit
      });

      return {
        success: true,
        data: {
          app_id: appId,
          count: result.logs.length,
          logs: result.logs,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          queryTime: result.queryTime
        },
        message: `Retrieved ${result.logs.length} log entries for app_id: ${appId}`
      };
    } catch (error) {
      // Return business-friendly error
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve logs by app_id'
      };
    }
  }
}

module.exports = GetLogsByAppIdUseCase;

