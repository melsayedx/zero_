/**
 * LogRepositoryContract - Abstract interface defining the contract for log storage implementations.
 *
 * This contract defines the essential operations that any log storage implementation must provide,
 * enabling dependency inversion and allowing different storage backends (ClickHouse, Redis, etc.)
 * to be used interchangeably. The interface is designed for high-performance log processing
 * with batch operations, pagination, and comprehensive health monitoring.
 *
 * @example
 * ```javascript
 * // Implementation and usage
 * class RedisLogRepository extends LogRepositoryContract {
 *   async save(logEntries) {
 *     const serialized = logEntries.map(entry => entry.toObject());
 *     await this.client.rpush('logs:queue', serialized);
 *     return { count: logEntries.length };
 *   }
 * }
 *
 * const repository = new RedisLogRepository(redisClient);
 * await repository.save([logEntry1, logEntry2]);
 * ```
 */
class LogRepositoryContract {
  /**
   * Save multiple log entries in batch with performance optimization.
   *
   * This method should implement high-throughput batch insertion optimized for the specific
   * storage backend. For ingestion repositories (like Redis), this typically means queueing
   * logs for later processing. For query repositories (like ClickHouse), this means direct
   * database insertion.
   *
   * @param {LogEntry[]} logEntries - Array of validated log entries to save
   * @returns {Promise<Object>} Operation result with performance metrics
   * @throws {Error} If the batch operation fails completely
   *
   * @example
   * ```javascript
   * const result = await repository.save([entry1, entry2, entry3]);
   * console.log(`Saved ${result.count} logs`);
   * ```
   */
  async save(logEntries) {
    throw new Error('Method not implemented: save()');
  }

  /**
   * Find logs by filter with optimized pagination and sorting.
   *
   * This method provides efficient log querying with cursor-based pagination to handle
   * large result sets without memory exhaustion.
   *
   * @param {Object} options - Query options object
   * @param {Object} [options.filter={}] - Filter conditions for narrowing results
   * @param {number} [options.limit=100] - Maximum number of logs to return
   * @param {Object} [options.cursor=null] - Pagination cursor for efficient scrolling
   * @param {Object} [options.sort=null] - Sort options for result ordering
   * @returns {Promise<Object>} Paginated query results with metadata
   *
   * @example
   * ```javascript
   * const result = await repository.findBy({
   *   filter: { appId: 'my-app', level: 'ERROR' },
   *   limit: 50
   * });
   * console.log(`Found ${result.logs.length} logs`);
   * ```
   */
  async findBy({ filter = {}, limit = 100, cursor = null, sort = null }) {
    throw new Error('Method not implemented: findBy()');
  }

  /**
   * Get performance statistics and operational metrics for the repository.
   *
   * This method provides insights into the repository's performance and operational status,
   * including queue lengths, throughput metrics, error rates, and backend-specific statistics.
   *
   * @returns {Promise<Object>} Comprehensive performance and operational metrics
   *
   * @example
   * ```javascript
   * const stats = await repository.getStats();
   * console.log(`Queue length: ${stats.queueLength}`);
   * ```
   */
  async getStats() {
    throw new Error('Method not implemented: getStats()');
  }

  /**
   * Perform comprehensive health check of the repository and its dependencies.
   *
   * This method validates the operational status of the storage backend, including
   * connectivity, permissions, and basic functionality.
   *
   * @returns {Promise<Object>} Health check results with diagnostic information
   *
   * @example
   * ```javascript
   * const health = await repository.healthCheck();
   * if (!health.healthy) {
   *   console.error(`Repository unhealthy: ${health.error}`);
   * }
   * ```
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck()');
  }
}

module.exports = LogRepositoryContract;

