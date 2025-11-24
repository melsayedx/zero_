const LogRepositoryPort = require('../../core/ports/log-repository.port');

/**
 * RedisLogRepository - High-throughput log ingestion implementation using Redis as a queue.
 *
 * This repository implements the LogRepositoryPort interface to provide "fire-and-forget"
 * log ingestion capabilities. Logs are pushed to a Redis list (queue) for later processing
 * by background workers, enabling extremely high ingestion throughput.
 *
 * @example
 * ```javascript
 * const repository = new RedisLogRepository(redisClient);
 * await repository.save([logEntry1, logEntry2, logEntry3]);
 * ```
 */
class RedisLogRepository extends LogRepositoryPort {
  /**
   * Create a new RedisLogRepository instance with the specified Redis client and configuration.
   *
   * @param {Redis} client - Configured Redis client instance (ioredis or compatible)
   * @param {Object} [options={}] - Configuration options for the repository
   * @param {string} [options.queueKey='logs:ingestion:queue'] - Redis key for the ingestion queue
   * @throws {Error} If client is not provided or invalid
   *
   * @example
   * ```javascript
   * const repository = new RedisLogRepository(redisClient, {
   *   queueKey: 'logs:ingestion:queue'
   * });
   * ```
   */
  constructor(client, options = {}) {
    super();

    if (!client) {
      throw new Error('Redis client is required for RedisLogRepository');
    }

    this.client = client;
    this.queueKey = options.queueKey || 'logs:ingestion:queue';
  }

  /**
   * Save multiple log entries to the Redis ingestion queue with atomic batch operation.
   *
   * This method implements high-throughput "fire-and-forget" ingestion by pushing log entries
   * to a Redis list. The operation is atomic - either all logs in the batch are queued or
   * none are.
   *
   * @param {LogEntry[]} logEntries - Array of validated log entries to queue
   * @returns {Promise<void>} Resolves immediately after successful queueing
   * @throws {Error} If Redis operation fails or connection is lost
   *
   * @example
   * ```javascript
   * const batch = [entry1, entry2, entry3];
   * await repository.save(batch);
   * ```
   */
  async save(logEntries) {
    if (!Array.isArray(logEntries) || logEntries.length === 0) {
      return;
    }

    // Serialize each log individually for Redis storage
    // Why individual JSON.stringify instead of bulk?
    // 1. Redis LPUSH/RPUSH operations work with individual strings
    // 2. Allows atomic operations on individual logs
    // 3. Easier error handling and debugging per log
    // 4. Consistent with Redis list semantics
    //
    // Note: We create a Redis-specific serialization that keeps metadata as object
    // (not string like toObject()) so it can be properly reconstructed by LogEntry.create()
    const serializedLogs = logEntries.map(entry => {
      const obj = entry.toObject();
      // Convert metadata back from string to object for Redis storage
      // This allows proper reconstruction when parsing from Redis
      const redisObj = {
        ...obj,
        metadata: entry.metadata.value // Use the object form, not the string form
      };
      return JSON.stringify(redisObj);
    });

    try {
      // Single atomic RPUSH operation for all logs - much more efficient
      // than individual operations or pipeline with spread operator
      await this.client.rpush(this.queueKey, serializedLogs);
    } catch (error) {
      console.error('[RedisLogRepository] Failed to queue logs:', error);
      throw new Error('Failed to queue logs for processing');
    }
  }

  /**
   * Perform comprehensive health check of Redis connectivity and basic operations.
   *
   * This method validates the Redis connection by performing a PING operation and
   * measuring response latency.
   *
   * @returns {Promise<Object>} Health check results with diagnostic information
   * @returns {boolean} result.healthy - Overall health status
   * @returns {number} result.latency - Redis PING operation latency in milliseconds
   * @returns {string} result.version - Repository implementation identifier
   * @returns {string} [result.error] - Detailed error message if unhealthy
   *
   * @example
   * ```javascript
   * const health = await repository.healthCheck();
   * if (!health.healthy) {
   *   console.error(`Redis unhealthy: ${health.error}`);
   * }
   * ```
   */
  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      return {
        healthy: true,
        latency: Date.now() - start,
        version: 'Redis'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get operational statistics for the Redis ingestion queue.
   *
   * This method provides key metrics for monitoring the ingestion pipeline's health
   * and performance.
   *
   * @returns {Promise<Object>} Queue statistics and operational metrics
   * @returns {number} result.queueLength - Current number of queued log entries
   * @returns {string} result.queueKey - Redis key used for the ingestion queue
   *
   * @example
   * ```javascript
   * const stats = await repository.getStats();
   * console.log(`Pending logs: ${stats.queueLength}`);
   * ```
   */
  async getStats() {
    const length = await this.client.llen(this.queueKey);
    return {
      queueLength: length,
      queueKey: this.queueKey
    };
  }

  /**
   * Query method not supported - RedisLogRepository is ingestion-only.
   *
   * This repository implements a write-only interface optimized for high-throughput
   * ingestion. Log querying and retrieval operations are not supported because:
   *
   * - Redis lists are optimized for FIFO queue operations, not complex queries
   * - Querying would compete with ingestion for Redis resources
   * - Logs are processed asynchronously to ClickHouse for querying
   * - This separation enables independent scaling of ingestion vs querying
   */
  async findBy() {
    throw new Error('RedisLogRepository does not support querying logs. Use ClickHouseRepository.');
  }
}

module.exports = RedisLogRepository;

