const LogRepositoryContract = require('../../domain/contracts/log-repository.contract');

/**
 * RedisLogRepository - High-throughput log ingestion implementation using Redis as a queue.
 *
 * This repository implements the LogRepositoryPort interface to provide "fire-and-forget"
 * log ingestion capabilities. Logs are pushed to a Redis Stream for later processing
 * by background workers, enabling extremely high ingestion throughput.
 *
 * @example
 * ```javascript
 * const repository = new RedisLogRepository(redisClient);
 * await repository.save([logEntry1, logEntry2, logEntry3]);
 * ```
 */
class RedisLogRepository extends LogRepositoryContract {
  /**
   * Create a new RedisLogRepository instance with the specified Redis client and configuration.
   *
   * @param {Redis} client - Configured Redis client instance (ioredis or compatible)
   * @param {Object} [options={}] - Configuration options for the repository
   * @param {string} [options.queueKey='logs:stream'] - Redis key for the ingestion stream
   * @throws {Error} If client is not provided or invalid
   *
   * @example
   * ```javascript
   * const repository = new RedisLogRepository(redisClient, {
   *   queueKey: 'logs:stream'
   * });
   * ```
   */
  constructor(client, options = {}) {
    super();

    if (!client) {
      throw new Error('Redis client is required for RedisLogRepository');
    }

    this.client = client;
    // Reliable stream for crash-proof processing (matches LogProcessorWorker)
    this.streamKey = options.streamKey || options.queueKey || 'logs:stream';
    this.logger = options.logger;
  }

  /**
   * Save multiple log entries to Redis Stream with atomic batch operation.
   *
   * Uses pipelined XADD for high-throughput, reliable ingestion.
   * Workers read from this stream using XREADGROUP (crash-proof).
   *
   * @param {LogEntry[]} logEntries - Array of validated log entries to queue
   * @returns {Promise<void>} Resolves when all entries are added to the stream
   * @throws {Error} If the stream operation fails
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

    try {
      // Serialize and pipeline XADD operations
      // Pipelining reduces network RTT overhead significantly
      const pipeline = this.client.pipeline();
      if (this.logger) {
        this.logger.debug('Saving log entries to Redis stream', { count: logEntries.length });
      }
      for (let i = 0; i < logEntries.length; i++) {
        // XADD streamKey * data <json>
        pipeline.xadd(this.streamKey, '*', 'data', JSON.stringify(logEntries[i]));
      }

      await pipeline.exec();
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to add logs to stream', { error: error.message });
      } else {
        // Fallback for critical error
        console.error('[RedisLogRepository] Failed to add logs to stream:', error);
      }
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
   * Get operational statistics for the Redis ingestion stream.
   *
   * This method provides key metrics for monitoring the ingestion pipeline's health
   * and performance.
   *
   * @returns {Promise<Object>} Stream statistics and operational metrics
   * @returns {number} result.streamLength - Current number of entries in stream
   * @returns {string} result.streamKey - Redis key used for the ingestion stream
   *
   * @example
   * ```javascript
   * const stats = await repository.getStats();
   * console.log(`Stream entries: ${stats.streamLength}`);
   * ```
   */
  async getStats() {
    const length = await this.client.xlen(this.streamKey);
    return {
      streamLength: length,
      streamKey: this.streamKey
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
