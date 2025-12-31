const QueryResult = require('./query-result');

class LogRetrievalUseCase {
  constructor(logRepository) {
    this.logRepository = logRepository;
  }

  /**
   * Execute the use case to retrieve logs.
   * @param {string} appId - Application ID to filter by
   * @param {number} [limit=1000] - Maximum number of logs to return
   * @returns {Promise<QueryResult>} Structured result with query data and performance metrics
   */
  async execute(appId, limit = 1000) {
    try {
      this._validateAppId(appId);
      this._validateLimit(limit);

      const startTime = performance.now();
      const repositoryResult = await this.logRepository.findBy({
        filter: { app_id: appId },
        limit: limit
      });

      const queryTime = performance.now() - startTime;
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

  _validateAppId(appId) {
    if (!appId || typeof appId !== 'string' || appId.trim().length === 0 || appId.length > 255) {
      throw new Error(`
        app_id is required and must be a string 
        and cannot be empty or whitespace only and must not exceed 255 characters
      `);
    }
  }

  _validateLimit(limit) {
    if (typeof limit !== 'number' || isNaN(limit) || !Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw new Error('Limit must be an integer between 1 and 10000');
    }
  }

}

module.exports = LogRetrievalUseCase;

