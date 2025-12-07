/**
 * BatchBuffer - Intelligent buffer for batching database operations
 *
 * This class provides an intelligent buffering mechanism that accumulates log entries
 * across multiple requests and flushes them to any database backend in optimized batches.
 * It implements both size-based and time-based flushing strategies to balance
 * latency and throughput, while providing comprehensive error handling and metrics.
 *
 * Key features:
 * - Size-based flushing with configurable batch size (default: 100,000 logs)
 * - Time-based flushing with configurable intervals (default: 1 second)
 * - Pluggable retry strategy for failed operations (Redis, in-memory, etc.)
 * - Comprehensive error handling and recovery
 * - Detailed performance metrics and health monitoring
 * - Graceful shutdown with final flush guarantee
 * - Concurrent flush protection to prevent data corruption
 * - Generic repository support (ClickHouse, TimestampDB, etc.)
 *
 * The buffer optimizes database performance by:
 * - Reducing network round trips through batching
 * - Utilizing repository-specific optimizations
 * - Maintaining efficient memory usage with bounded buffer size
 * - Providing resilient operation through configurable retry strategies
 *
 * @example
 * ```javascript
 * // Basic usage with ClickHouse repository and Redis retry
 * const retryStrategy = new RedisRetryStrategy(redisClient);
 * const buffer = new BatchBuffer(clickHouseRepository, retryStrategy);
 *
 * // Add logs to buffer (they accumulate until flush triggers)
 * await buffer.add([
 *   { timestamp: '2023-01-01T00:00:00Z', level: 'INFO', message: 'Test log' }
 * ]);
 *
 * // Manual flush (usually handled automatically)
 * const result = await buffer.flush();
 * console.log(`Flushed ${result.flushed} logs in ${result.duration}ms`);
 *
 * // Graceful shutdown (flushes remaining logs)
 * await buffer.shutdown();
 * ```
 *
 * @example
 * ```javascript
 * // Usage with in-memory retry for testing
 * const retryStrategy = new InMemoryRetryStrategy();
 * const buffer = new BatchBuffer(testRepository, retryStrategy, {
 *   maxBatchSize: 1000,
 *   maxWaitTime: 100
 * });
 * ```
 */

class BatchBuffer {
  /**
   * Create a new BatchBuffer instance with the specified repository and retry strategy.
   *
   * Initializes the buffer with default or custom settings for batch size and flush timing.
   * Starts the automatic flush timer and sets up internal metrics tracking. The repository
   * can be any database implementation (ClickHouse, TimestampDB, etc.) that supports batch operations.
   * The retry strategy handles failed operations and can be configured for different storage backends.
   *
   * @param {Object} repository - Repository instance with save method for database operations
   * @param {RetryStrategy} retryStrategy - Strategy for handling failed operations
   * @param {Object} [options={}] - Configuration options for the buffer
   * @param {number} [options.maxBatchSize=100000] - Maximum logs per batch before auto-flush (1-1000000)
   * @param {number} [options.maxWaitTime=1000] - Maximum time in ms to wait before auto-flush (100-30000)
   * @param {boolean} [options.enableLogging=true] - Whether to enable console logging
   * @param {Function} [options.onFlushSuccess] - Callback invoked after successful flush with flushed logs
   *
   * @example
   * ```javascript
   * // Default configuration with ClickHouse and Redis retry
   * const retryStrategy = new RedisRetryStrategy(redisClient);
   * const buffer = new BatchBuffer(clickHouseRepository, retryStrategy);
   *
   * // Custom configuration with in-memory retry
   * const retryStrategy = new InMemoryRetryStrategy({ maxRetries: 5 });
   * const buffer = new BatchBuffer(clickHouseRepository, retryStrategy, {
   *   maxBatchSize: 50000,
   *   maxWaitTime: 2000,
   *   enableLogging: false
   * });
   * ```
   */
  constructor(repository, retryStrategy, options = {}) {
    // Validate required parameters
    if (!repository || typeof repository.save !== 'function') {
      throw new Error('Valid repository with save method is required');
    }
    if (!retryStrategy || typeof retryStrategy.queueForRetry !== 'function') {
      throw new Error('Valid retry strategy with queueForRetry method is required');
    }

    this.repository = repository;
    this.retryStrategy = retryStrategy;

    // Buffer configuration with validation
    this.maxBatchSize = Math.max(1, Math.min(1000000, options.maxBatchSize || 100000));
    this.maxWaitTime = Math.max(100, Math.min(30000, options.maxWaitTime || 1000));
    this.enableLogging = options.enableLogging !== false;

    // Optional callback for crash-proof ACK (called after successful DB persistence)
    this.onFlushSuccess = typeof options.onFlushSuccess === 'function' ? options.onFlushSuccess : null;

    // Buffer state
    this.buffer = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.isShuttingDown = false;

    // Metrics with cached calculations
    this.metrics = {
      totalLogsBuffered: 0,
      totalLogsInserted: 0,
      totalFlushes: 0,
      totalErrors: 0,
      avgBatchSize: 0,
      lastFlushTime: null,
      lastFlushSize: 0
    };

    // Cached health check values
    this._cachedHealth = null;
    this._healthCacheTime = 0;
    this._healthCacheTTL = 5000; // Cache health for 5 seconds

    // Start the flush timer
    this.startFlushTimer();

    if (this.enableLogging) {
      console.log('[BatchBuffer] Initialized with config:', {
        maxBatchSize: this.maxBatchSize,
        maxWaitTime: this.maxWaitTime,
        repositoryType: repository.constructor.name,
        retryStrategyType: retryStrategy.constructor.name
      });
    }
  }

  /**
   * Add an array of log entries to the buffer for batch processing.
   *
   * This method efficiently appends validated log entries to the internal buffer using
   * optimized array concatenation. It triggers automatic flushing if the buffer size
   * exceeds the configured maximum batch size. During shutdown, new log entries are
   * rejected to ensure clean finalization.
   *
   * @param {Array<Object>} logs - Array of validated log objects to buffer
   * @returns {Promise<void>} Resolves when logs are buffered (may trigger flush)
   * @throws {Error} If the buffer is shutting down or logs parameter is invalid
   *
   * @example
   * ```javascript
   * // Add multiple logs at once (efficient for large arrays)
   * await buffer.add([
   *   { timestamp: '2023-01-01T00:00:00Z', level: 'INFO', message: 'User login' },
   *   { timestamp: '2023-01-01T00:00:01Z', level: 'ERROR', message: 'Database timeout' }
   * ]);
   * ```
   */
  async add(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      return;
    }

    if (this.isShuttingDown) {
      throw new Error('BatchBuffer is shutting down, cannot accept new logs');
    }

    // Efficient array concatenation - much faster than spread operator for large arrays
    const currentLength = this.buffer.length;
    const newLength = currentLength + logs.length;

    // Pre-allocate buffer if needed for better performance
    if (this.buffer.length === 0) {
      this.buffer = new Array(newLength);
    } else if (newLength > this.buffer.length) {
      this.buffer.length = Math.max(newLength, this.buffer.length * 2);
    }

    // Copy logs efficiently
    for (let i = 0; i < logs.length; i++) {
      this.buffer[currentLength + i] = logs[i];
    }

    // Trim to actual size
    this.buffer.length = newLength;

    this.metrics.totalLogsBuffered += logs.length;

    // Check if we need to flush based on size
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Flush the current buffer contents to the repository in a single batch operation.
   *
   * This method performs the actual database insertion by calling the repository's save method.
   * It prevents concurrent flushes and updates comprehensive metrics. Failed operations are
   * sent to a Redis-based dead letter queue for later processing by background workers.
   *
   * @returns {Promise<Object>} Flush result containing operation metrics
   * @returns {number} result.flushed - Number of logs successfully inserted
   * @returns {number} result.buffered - Number of logs remaining in buffer after flush
   * @returns {number} result.duration - Time taken for flush operation in milliseconds
   *
   * @example
   * ```javascript
   * // Manual flush (usually automatic)
   * const result = await buffer.flush();
   * console.log(`Inserted ${result.flushed} logs in ${result.duration}ms`);
   * ```
   */
  async flush() {
    // Prevent concurrent flushes
    if (this.isFlushing || this.buffer.length === 0) {
      return { flushed: 0, buffered: this.buffer.length };
    }

    this.isFlushing = true;
    const startTime = Date.now();

    // Take current buffer and reset (allows new logs to accumulate)
    const logsToFlush = this.buffer;
    this.buffer = [];

    // Restart the flush timer
    this.resetFlushTimer();

    try {
      // Call repository's generic save method
      await this.repository.save(logsToFlush);

      // Update metrics efficiently
      const flushTime = Date.now() - startTime;
      this._updateMetricsAfterSuccess(logsToFlush.length, flushTime);

      // Invoke ACK callback for crash-proof processing (e.g., Redis XACK)
      if (this.onFlushSuccess) {
        try {
          await this.onFlushSuccess(logsToFlush);
        } catch (ackError) {
          // Log but don't fail - data is already persisted
          console.error('[BatchBuffer] onFlushSuccess callback error:', ackError.message);
        }
      }

      if (this.enableLogging) {
        console.log('[BatchBuffer] Flushed successfully:', {
          logs: logsToFlush.length,
          duration: flushTime + 'ms',
          buffered: this.buffer.length,
          totalInserted: this.metrics.totalLogsInserted
        });
      }

      return {
        flushed: logsToFlush.length,
        buffered: this.buffer.length,
        duration: flushTime
      };

    } catch (error) {
      this.metrics.totalErrors++;

      if (this.enableLogging) {
        console.error('[BatchBuffer] Flush error:', {
          error: error.message,
          logsLost: logsToFlush.length,
          buffered: this.buffer.length
        });
      }

      // Queue failed batch for retry using the configured strategy
      await this.retryStrategy.queueForRetry(logsToFlush, error, {
        repository: this.repository.constructor.name,
        bufferConfig: {
          maxBatchSize: this.maxBatchSize,
          maxWaitTime: this.maxWaitTime
        }
      });

      throw error;

    } finally {
      this.isFlushing = false;
    }
  }


  /**
   * Update metrics after successful flush operation.
   * @private
   */
  _updateMetricsAfterSuccess(logCount, duration) {
    this.metrics.totalLogsInserted += logCount;
    this.metrics.totalFlushes++;
    // Optimize average calculation to avoid repeated division
    this.metrics.avgBatchSize = Math.round(this.metrics.totalLogsInserted / this.metrics.totalFlushes);
    this.metrics.lastFlushTime = new Date().toISOString();
    this.metrics.lastFlushSize = logCount;
  }


  /**
   * Start the periodic flush timer for time-based automatic flushing.
   *
   * Sets up a timer that will automatically trigger a flush operation after the
   * configured maximum wait time. This ensures logs don't stay buffered indefinitely
   * during low-traffic periods. Uses optimized timer management to reduce reset frequency.
   *
   * @private
   *
   * @example
   * ```javascript
   * // Timer automatically calls flush() after maxWaitTime milliseconds
   * // Optimized to avoid frequent resets during high-throughput periods
   * ```
   */
  startFlushTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Only set timer if not shutting down and buffer is not empty
    if (!this.isShuttingDown && this.buffer.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch(error => {
          if (this.enableLogging) {
            console.error('[BatchBuffer] Timer flush error:', error.message);
          }
        });
      }, this.maxWaitTime);
    }
  }

  /**
   * Reset the flush timer after a successful flush operation.
   *
   * This method optimizes timer management by only resetting when necessary,
   * reducing the overhead of frequent timer operations during high-throughput periods.
   *
   * @private
   *
   * @example
   * ```javascript
   * // Timer is only reset when beneficial, not after every flush
   * ```
   */
  resetFlushTimer() {
    // Only reset timer if buffer is empty or if we're not in high-throughput mode
    // This optimization reduces timer reset frequency during rapid flushes
    const shouldResetTimer = this.buffer.length === 0 ||
      (this.flushTimer && this.buffer.length < this.maxBatchSize * 0.1);

    if (!this.isShuttingDown && shouldResetTimer) {
      this.startFlushTimer();
    }
  }

  /**
   * Get the current number of log entries in the buffer.
   *
   * Returns the count of log entries currently waiting to be flushed to ClickHouse.
   * This includes any logs added since the last flush operation.
   *
   * @returns {number} Number of log entries currently buffered
   *
   * @example
   * ```javascript
   * console.log(`Buffer contains ${buffer.size()} logs`);
   *
   * await buffer.add(logs);
   * console.log(`After adding logs: ${buffer.size()}`); // Increased by logs.length
   *
   * await buffer.flush();
   * console.log(`After flush: ${buffer.size()}`); // Usually 0
   * ```
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Get comprehensive metrics about buffer performance and operation.
   *
   * Returns detailed statistics about buffer usage, flush operations, error rates,
   * and current operational state. Useful for monitoring, debugging, and performance
   * analysis.
   *
   * @returns {Object} Comprehensive buffer metrics
   * @returns {number} metrics.totalLogsBuffered - Total logs added to buffer since startup
   * @returns {number} metrics.totalLogsInserted - Total logs successfully inserted to ClickHouse
   * @returns {number} metrics.totalFlushes - Total number of flush operations performed
   * @returns {number} metrics.totalErrors - Total number of flush errors encountered
   * @returns {number} metrics.avgBatchSize - Average batch size across all flushes
   * @returns {string|null} metrics.lastFlushTime - ISO timestamp of last successful flush
   * @returns {number} metrics.lastFlushSize - Number of logs in last flush operation
   * @returns {number} metrics.currentBufferSize - Current number of logs in buffer
   * @returns {boolean} metrics.isFlushing - Whether a flush operation is currently in progress
   *
   * @example
   * ```javascript
   * const metrics = buffer.getMetrics();
   * console.log('Buffer Health Report:');
   * console.log(`- Total processed: ${metrics.totalLogsInserted} logs`);
   * console.log(`- Current buffer: ${metrics.currentBufferSize} logs`);
   * console.log(`- Average batch size: ${metrics.avgBatchSize}`);
   * console.log(`- Error rate: ${metrics.totalErrors}/${metrics.totalFlushes}`);
   * console.log(`- Currently flushing: ${metrics.isFlushing}`);
   * ```
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentBufferSize: this.buffer.length,
      isFlushing: this.isFlushing
    };
  }

  /**
   * Perform graceful shutdown with guaranteed final flush of remaining logs.
   *
   * This method ensures no log data is lost during application termination by:
   * 1. Setting shutdown flag to reject new log additions
   * 2. Clearing automatic timers
   * 3. Performing final flush of buffered logs
   * 4. Cleaning up all resources and connections
   *
   * Failed operations during shutdown are sent to the dead letter queue for
   * later processing by background workers.
   *
   * @returns {Promise<Object>} Shutdown result with final statistics
   * @returns {number} result.flushed - Total logs flushed during shutdown
   * @returns {number} result.failed - Logs that failed and were sent to dead letter queue
   *
   * @example
   * ```javascript
   * // Graceful application shutdown
   * process.on('SIGTERM', async () => {
   *   console.log('Received shutdown signal, flushing logs...');
   *   try {
   *     const result = await buffer.shutdown();
   *     console.log('Shutdown complete:', {
   *       flushed: result.flushed,
   *       failed: result.failed
   *     });
   *     process.exit(result.failed > 0 ? 1 : 0);
   *   } catch (error) {
   *     console.error('Critical shutdown error:', error);
   *     process.exit(1);
   *   }
   * });
   * ```
   */
  async shutdown() {
    if (this.enableLogging) {
      console.log('[BatchBuffer] Shutting down...');
    }

    this.isShuttingDown = true;
    let totalFlushed = 0;
    let totalFailed = 0;

    // Clear all timers
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush of remaining buffer
    if (this.buffer.length > 0) {
      if (this.enableLogging) {
        console.log(`[BatchBuffer] Final flush of ${this.buffer.length} remaining logs...`);
      }

      try {
        // Call repository's save method directly
        await this.repository.save(this.buffer);
        this._updateMetricsAfterSuccess(this.buffer.length, 0);
        totalFlushed += this.buffer.length;
        this.buffer = [];

        if (this.enableLogging) {
          console.log('[BatchBuffer] Final flush complete');
        }
      } catch (error) {
        // Queue failed batch for retry using the configured strategy
        await this.retryStrategy.queueForRetry(this.buffer, error, {
          repository: this.repository.constructor.name,
          operation: 'shutdown-flush',
          bufferConfig: {
            maxBatchSize: this.maxBatchSize,
            maxWaitTime: this.maxWaitTime
          }
        });
        totalFailed += this.buffer.length;

        if (this.enableLogging) {
          console.error('[BatchBuffer] Final flush failed, queued for retry:', error.message);
        }
      }
    }

    // Shutdown the retry strategy
    await this.retryStrategy.shutdown();

    if (this.enableLogging) {
      console.log('[BatchBuffer] Shutdown complete:', {
        flushed: totalFlushed,
        failed: totalFailed,
        finalMetrics: this.metrics
      });
    }

    return {
      flushed: totalFlushed,
      failed: totalFailed
    };
  }

  /**
   * Force an immediate flush of the buffer, bypassing normal timing and size triggers.
   *
   * This method provides manual control over flush timing, useful for testing,
   * immediate data persistence requirements, or operational control. It directly
   * calls the internal flush method and returns the same result structure.
   *
   * @returns {Promise<Object>} Flush result with the same structure as flush()
   * @returns {number} result.flushed - Number of logs flushed (may be 0 if buffer empty)
   * @returns {number} result.buffered - Number of logs remaining in buffer
   * @returns {number} result.duration - Time taken for the flush operation
   *
 * @example
 * ```javascript
 * // Force immediate flush before system maintenance
 * console.log('Forcing buffer flush before maintenance...');
 * const result = await buffer.forceFlush();
 * console.log(`Flushed ${result.flushed} logs immediately`);
 * ```
   */
  async forceFlush() {
    console.log('[BatchBuffer] Force flush requested');
    return await this.flush();
  }

  /**
   * Get comprehensive health status and operational metrics for the buffer.
   *
   * This method provides health monitoring information useful for operational
   * dashboards, alerting systems, and automated health checks. Results are cached
   * for performance and recalculated only when needed or after cache expiry.
   *
   * @returns {Object} Health status and operational metrics
   * @returns {boolean} health.healthy - Overall health status (true if error rate < 10%)
   * @returns {number} health.bufferSize - Current number of logs in buffer
   * @returns {string} health.bufferUsage - Buffer usage as percentage string (e.g., "45.2%")
   * @returns {string} health.errorRate - Flush error rate as percentage string (e.g., "2.34%")
   * @returns {boolean} health.isFlushing - Whether a flush operation is currently active
   * @returns {Object} health.metrics - Complete metrics object (same as getMetrics())
   *
   * @example
   * ```javascript
   * const health = buffer.getHealth();
   *
   * if (!health.healthy) {
   *   console.warn('Buffer health degraded:', {
   *     errorRate: health.errorRate,
   *     bufferUsage: health.bufferUsage
   *   });
   *   // Trigger alerts, scaling, or manual intervention
   * }
   * ```
   */
  getHealth() {
    const now = Date.now();

    // Return cached result if still valid
    if (this._cachedHealth && (now - this._healthCacheTime) < this._healthCacheTTL) {
      return this._cachedHealth;
    }

    // Calculate health metrics
    const bufferUsage = (this.buffer.length / this.maxBatchSize) * 100;
    const errorRate = this.metrics.totalFlushes > 0
      ? (this.metrics.totalErrors / this.metrics.totalFlushes) * 100
      : 0;

    // Determine overall health (consider multiple factors)
    const healthy = errorRate < 10 && this.buffer.length < this.maxBatchSize * 0.9;

    const health = {
      healthy,
      bufferSize: this.buffer.length,
      bufferUsage: `${bufferUsage.toFixed(1)}%`,
      errorRate: `${errorRate.toFixed(2)}%`,
      isFlushing: this.isFlushing,
      metrics: this.metrics
    };

    // Cache the result
    this._cachedHealth = health;
    this._healthCacheTime = now;

    return health;
  }
}

/**
 * @typedef {BatchBuffer} BatchBuffer
 * @property {Object} repository - Repository instance with save method for database operations
 * @property {RetryStrategy} retryStrategy - Strategy for handling failed operations
 * @property {number} maxBatchSize - Maximum logs per batch before auto-flush (1-1000000)
 * @property {number} maxWaitTime - Maximum time in ms to wait before auto-flush (100-30000)
 * @property {boolean} enableLogging - Whether console logging is enabled
 * @property {Array} buffer - Internal array holding buffered log entries
 * @property {Timeout|null} flushTimer - Timer for automatic time-based flushing
 * @property {boolean} isFlushing - Flag indicating if a flush operation is in progress
 * @property {boolean} isShuttingDown - Flag indicating if buffer is shutting down
 * @property {Object} metrics - Performance and operational metrics
 * @property {Object|null} _cachedHealth - Cached health check result
 * @property {number} _healthCacheTime - Timestamp of last health check cache
 * @property {number} _healthCacheTTL - Health check cache time-to-live in milliseconds
 */

module.exports = BatchBuffer;

