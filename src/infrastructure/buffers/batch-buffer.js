/**
 * Buffer for batching database operations with size/time triggers.
 *
 * @example
 * const buffer = new BatchBuffer(repo, retryStrategy, { maxBatchSize: 1000 });
 * await buffer.add(logs); // Auto-flushes when full or time limit reached
 */

class BatchBuffer {
  /**
   * Creates a new BatchBuffer instance.
   * @param {Object} repository - DB repository with save() method.
   * @param {RetryStrategy} retryStrategy - Strategy for failed operations.
   * @param {Object} [options] - Config options.
   * @param {number} [options.maxBatchSize=100000] - Max logs before flush.
   * @param {number} [options.maxWaitTime=1000] - Max ms before flush.
   * @param {Logger} options.logger - Required logger instance.
   * @param {Function} [options.onFlushSuccess] - Callback after successful flush.
   */
  constructor(repository, retryStrategy, options = {}) {
    this.repository = repository;
    this.retryStrategy = retryStrategy;

    // Buffer configuration with validation
    this.maxBatchSize = Math.max(1, Math.min(1000000, options.maxBatchSize || 100000));
    this.maxWaitTime = Math.max(100, Math.min(30000, options.maxWaitTime || 1000));

    this.logger = options.logger;

    // Optional callback for crash-proof ACK (called after successful DB persistence)
    this.onFlushSuccess = options.onFlushSuccess;

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

    this._cachedHealth = null;
    this._healthCacheTime = 0;
    this._healthCacheTTL = 5000; // Cache health for 5 seconds

    this.startFlushTimer();

    this.logger.info('Initialized', {
      maxBatchSize: this.maxBatchSize,
      maxWaitTime: this.maxWaitTime,
      repositoryType: repository.constructor.name,
      retryStrategyType: retryStrategy.constructor.name
    });
  }

  /**
   * Adds logs to buffer, triggering flush if full.
   * @param {Array<Object>} logs - Logs to buffer.
   * @returns {Promise<void>}
   * @throws {Error} If shutting down or invalid input.
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

    // Ensure flush timer is running if buffer has items
    if (!this.flushTimer && !this.isFlushing) {
      this.startFlushTimer();
    }

    // Check if we need to flush based on size
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Persists buffered logs to repository.
   * @returns {Promise<Object>} Result { flushed, buffered, duration }.
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
      // Call repository's save method
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
          this.logger.error('onFlushSuccess callback error', { error: ackError.message });
        }
      }

      this.logger.debug('Flushed successfully', {
        logs: logsToFlush.length,
        duration: flushTime + 'ms',
        buffered: this.buffer.length,
        totalInserted: this.metrics.totalLogsInserted
      });

      return {
        flushed: logsToFlush.length,
        buffered: this.buffer.length,
        duration: flushTime
      };

    } catch (error) {
      this.metrics.totalErrors++;

      this.logger.error('Flush error', {
        error: error.message,
        logsLost: logsToFlush.length,
        buffered: this.buffer.length
      });

      // Queue failed batch for retry using the configured strategy
      try {
        await this.retryStrategy.queueForRetry(logsToFlush, error, {
          repository: this.repository.constructor.name,
          bufferConfig: {
            maxBatchSize: this.maxBatchSize,
            maxWaitTime: this.maxWaitTime
          }
        });

        // CRITICAL FIX: If effectively queued for retry (DLQ), we MUST ACK the original messages
        // so the worker doesn't re-process them infinitely. The DLQ is now the source of truth.
        if (this.onFlushSuccess) {
          try {
            this.logger.info('ACKing messages after successful retry queuing', { count: logsToFlush.length });
            await this.onFlushSuccess(logsToFlush);
          } catch (ackError) {
            this.logger.error('Failed to ACK after retry queueing', { error: ackError.message });
          }
        }
      } catch (retryError) {
        // Double failure: Save failed AND Retry Queue failed.
        // DO NOT ACK. Let the worker restart/reclaim these messages later.
        this.logger.error('Critical: Failed to queue for retry. Messages will remain pending.', {
          error: retryError.message,
          count: logsToFlush.length
        });
        throw retryError;
      }

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
   * Starts the auto-flush timer.
   * @private
   */
  startFlushTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Always set timer if not shutting down - timer will check buffer on fire
    // This ensures we never miss a flush even if add() timing is unusual
    if (!this.isShuttingDown) {
      this.flushTimer = setTimeout(() => {
        if (this.buffer.length > 0) {
          this.flush().catch(error => {
            this.logger.error('Timer flush error', { error: error.message });
          });
        }
        // Restart timer for next interval if still running
        if (!this.isShuttingDown) {
          this.startFlushTimer();
        }
      }, this.maxWaitTime);
    }
  }

  resetFlushTimer() {
    // Always ensure timer is running after a flush if we're not shutting down
    // The timer will self-restart on each tick, so just make sure it's active
    if (!this.isShuttingDown && !this.flushTimer) {
      this.startFlushTimer();
    }
  }

  /**
   * Flushes remaining logs and stops retry strategy.
   * @returns {Promise<Object>} Result { flushed, failed }.
   */
  async shutdown() {
    this.logger.info('Shutting down...');

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
      this.logger.info('Final flush of remaining logs', { count: this.buffer.length });

      try {
        // Call repository's save method directly
        await this.repository.save(this.buffer);
        this._updateMetricsAfterSuccess(this.buffer.length, 0);
        totalFlushed += this.buffer.length;
        this.buffer = [];

        this.logger.info('Final flush complete');
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

        this.logger.error('Final flush failed, queued for retry', { error: error.message });
      }
    }

    // Shutdown the retry strategy
    await this.retryStrategy.shutdown();

    this.logger.info('Shutdown complete', {
      flushed: totalFlushed,
      failed: totalFailed,
      finalMetrics: this.metrics
    });

    return {
      flushed: totalFlushed,
    };
  }

  async forceFlush() {
    this.logger.info('Force flush requested');
    return await this.flush();
  }

  /**
   * Calculates health metrics.
   * @returns {Object} Health status { healthy, bufferUsage, errorRate, ... }.
   */
  getHealth() {
    const now = performance.now();

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

    this._cachedHealth = health;
    this._healthCacheTime = now;

    return health;
  }
}

module.exports = BatchBuffer;

