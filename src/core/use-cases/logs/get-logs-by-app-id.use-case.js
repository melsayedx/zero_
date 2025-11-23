const LogRepositoryPort = require('../../ports/log-repository.port');
const QueryResult = require('./query-result');

/**
 * GetLogsByAppId Use Case
 * Core business logic for retrieving logs by application ID with performance optimization
 *
 * Architecture:
 * - Depends on: LogRepositoryPort (output port) - what this use case needs
 * - Returns: QueryResult - structured result object for query operations
 *
 * This follows the Dependency Inversion Principle and Hexagonal Architecture
 */
class GetLogsByAppIdUseCase {
  constructor(logRepository) {
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }

    // Validate that the repository implements the required port interface
    if (typeof logRepository.findBy !== 'function') {
      throw new Error('LogRepository must implement the findBy() method from LogRepositoryPort');
    }

    this.logRepository = logRepository;
  }

  /**
   * Execute the use case to retrieve logs by application ID
   * @param {string} appId - Application ID to filter by
   * @param {number} limit - Maximum number of logs to return (default: 1000)
   * @returns {Promise<QueryResult>} Structured result with query data and performance metrics
   */
  async execute(appId, limit = 1000) {
    try {
      // Validate inputs
      this._validateAppId(appId);
      this._validateLimit(limit);

      // Query logs via repository port with timing
      const startTime = Date.now();
      const repositoryResult = await this.logRepository.findBy({
        filter: { app_id: appId },
        limit: limit
      });
      const queryTime = Date.now() - startTime;

      // Return structured result
      return new QueryResult({
        appId,
        count: repositoryResult.logs.length,
        logs: repositoryResult.logs,
        hasMore: repositoryResult.hasMore,
        nextCursor: repositoryResult.nextCursor,
        queryTime,
        filter: { app_id: appId },
        limit
      });

    } catch (error) {
      // Re-throw business logic errors with context
      throw new Error(`Failed to retrieve logs for app_id "${appId}": ${error.message}`);
    }
  }

  /**
   * Validate application ID input
   * @private
   * @param {string} appId - Application ID to validate
   * @throws {Error} If appId is invalid
   */
  _validateAppId(appId) {
    if (!appId || typeof appId !== 'string') {
      throw new Error('app_id is required and must be a string');
    }

    if (appId.trim().length === 0) {
      throw new Error('app_id cannot be empty or whitespace only');
    }

    // Basic length validation to prevent abuse
    if (appId.length > 255) {
      throw new Error('app_id must not exceed 255 characters');
    }
  }

  /**
   * Validate limit parameter
   * @private
   * @param {number} limit - Limit value to validate
   * @throws {Error} If limit is invalid
   */
  _validateLimit(limit) {
    if (typeof limit !== 'number' || isNaN(limit)) {
      throw new Error('Limit must be a valid number');
    }

    if (!Number.isInteger(limit)) {
      throw new Error('Limit must be an integer');
    }

    if (limit < 1) {
      throw new Error('Limit must be at least 1');
    }

    if (limit > 10000) {
      throw new Error('Limit must not exceed 10000');
    }
  }
}

module.exports = GetLogsByAppIdUseCase;

