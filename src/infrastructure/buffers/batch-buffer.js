/**
 * Buffer for batching database operations with size/time triggers.
 * BatchBuffer is designed for a single-writer pattern within an isolated
 * worker thread. 
 * 
 * The double-buffer pattern isn't for multi-threading - 
 * it's for non-blocking writes (one buffer accepts data while the other flushes to ClickHouse).
 * 
 * @example
 * const buffer = new BatchBuffer(repo, retryStrategy, { maxBatchSize: 100000 });
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
   * @param {Logger} [options.logger] - Required logger instance.
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

    // Double Buffer (Ping-Pong) State
    this.bufferA = new Array(this.maxBatchSize);
    this.bufferB = new Array(this.maxBatchSize);
    this.activeBuffer = this.bufferA;
    this.count = 0; // Tracks items in the ACTIVE buffer

    this.flushTimer = null;
    this.isFlushing = false;
    this.isShuttingDown = false;

    // Concurrency Control
    this.activeFlushes = new Set(); // Track ALL active background flushes
    this.maxConcurrentFlushes = options.maxConcurrentFlushes || 5; // Backpressure limit

    // Metrics with cached calculations
    this.metrics = {
      totalLogsBuffered: 0,
      totalLogsInserted: 0,
      totalFlushes: 0,
      totalErrors: 0,
      avgBatchSize: 0,
      lastFlushTime: null,
      lastFlushSize: 0,
      lastFlushDuration: 0
    };

    this._cachedHealth = null;
    this._healthCacheTime = 0;
    this._healthCacheTTL = 5000;

    this._ensureTimerIsRunning();
  }

  /**
   * Adds logs to buffer, triggering flush if full.
   * @param {Array<Object>} logs - Logs to buffer.
   * @returns {Promise<void>}
   * @throws {Error} If shutting down or invalid input.
   */
  async add(logs) {
    if (this.isShuttingDown) {
      throw new Error('BatchBuffer is shutting down, cannot accept new logs');
    }

    if (!logs || logs.length === 0) return;

    // Check if new logs fit in remaining space of ACTIVE buffer
    const remainingSpace = this.maxBatchSize - this.count;

    // Case 1: All logs fit
    if (logs.length <= remainingSpace) {
      for (let i = 0; i < logs.length; i++) {
        this.activeBuffer[this.count++] = logs[i];
      }
      this.metrics.totalLogsBuffered += logs.length;

      // If full, SWAP AND FLUSH
      if (this.count >= this.maxBatchSize) {
        await this._swapAndFlush();
      } else {
        // Ensure timer is running if we have data
        this._ensureTimerIsRunning();
      }
    }
    // Case 2: Logs overflow buffer - split them
    else {
      // Fill remainder
      for (let i = 0; i < remainingSpace; i++) {
        this.activeBuffer[this.count++] = logs[i];
      }
      // Buffer full -> Swap and flush, then process remainder
      await this._swapAndFlush();

      // Recursively add the rest
      const remainingLogs = logs.slice(remainingSpace);
      await this.add(remainingLogs);
    }
  }

  /**
   * Internal helper: Swaps active buffer and triggers background flush.
   * returning immediately unless backpressure is active.
   * @private
   */
  async _swapAndFlush() {
    if (this.count === 0) return;

    // 0. Backpressure Control
    if (this.activeFlushes.size >= this.maxConcurrentFlushes) {
      this.logger.warn('Backpressure: Max concurrent flushes reached, waiting for a slot...');
      // Wait for ANY flush to finish to free up a slot
      await Promise.race(this.activeFlushes);
    }

    const bufferToFlush = this.activeBuffer;
    const countToFlush = this.count;
    this.activeBuffer = (this.activeBuffer === this.bufferA) ? this.bufferB : this.bufferA;
    this.count = 0;

    // 3. Clear timer if it was running (flush handles it)
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // 4. Trigger flush in BACKGROUND (do not await)
    // Track the promise in the Set for shutdown safety
    const flushPromise = this._flushBuffer(bufferToFlush, countToFlush)
      .catch(err => {
        this.logger.error('Background flush failed', { error: err.message });
      })
      .finally(() => {
        this.activeFlushes.delete(flushPromise);
      });

    this.activeFlushes.add(flushPromise);
  }

  /**
   * Internal method: Persists a specific buffer to repository.
   * @param {Array} buffer - The buffer array to flush
   * @param {number} count - Number of items in that buffer
   * @returns {Promise<Object>} Result
   * @private
   */
  async _flushBuffer(buffer, count) {
    this.isFlushing = true;
    const startTime = performance.now();

    // Create a view of the VALID data to flush
    const logsToFlush = buffer.slice(0, count);

    try {
      // Call repository's save method
      await this.repository.save(logsToFlush);

      // Update metrics efficiently
      const flushTime = performance.now() - startTime;
      this._updateMetricsAfterSuccess(logsToFlush.length, flushTime);

      // Invoke ACK callback 
      if (this.onFlushSuccess) {
        try {
          await this.onFlushSuccess(logsToFlush);
        } catch (ackError) {
          this.logger.error('onFlushSuccess callback error', { error: ackError.message });
        }
      }

      this.logger.debug('Flushed successfully', {
        logs: logsToFlush.length,
        duration: flushTime + 'ms',
        totalInserted: this.metrics.totalLogsInserted
      });

      return {
        flushed: logsToFlush.length,
        duration: flushTime
      };

    } catch (error) {
      this.metrics.totalErrors++;

      this.logger.error('Flush error', {
        error: error.message,
        logsLost: logsToFlush.length
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

        // CRITICAL FIX: If queued for retry, we MUST ACK original messages
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
   * Updates metrics after a successful flush.
   * @param {number} count - Number of logs flushed.
   * @param {number} duration - Flush duration in ms.
   * @private
   */
  _updateMetricsAfterSuccess(count, duration) {
    this.metrics.totalLogsInserted += count;
    this.metrics.totalFlushes++;
    this.metrics.lastFlushTime = new Date().toISOString();
    this.metrics.lastFlushSize = count;
    this.metrics.lastFlushDuration = duration;
    // Optimize average calculation to avoid repeated division
    this.metrics.avgBatchSize = Math.round(this.metrics.totalLogsInserted / this.metrics.totalFlushes);
  }

  _ensureTimerIsRunning() {
    if (!this.flushTimer && !this.isShuttingDown && this.count > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null; // Timer fired, clear ref
        if (this.count > 0) {
          this._swapAndFlush();
        }
      }, this.maxWaitTime);
    }
  }

  async flush() {
    if (this.count > 0) {
      await this._swapAndFlush();
    }
    // Wait for ALL active background flushes
    if (this.activeFlushes.size > 0) {
      await Promise.all(this.activeFlushes);
    }
  }

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
    if (this.count > 0) {
      this.logger.info('Final flush of remaining logs', { count: this.count });

      try {
        // Reuse internal _flushBuffer and await it
        await this._flushBuffer(this.activeBuffer, this.count);
        totalFlushed += this.count;
        this.activeBuffer = null; // Prevent further use

        this.logger.info('Final flush complete');
      } catch (error) {
        // Error handling is inside _flushBuffer but re-thrown
        totalFailed += this.count;
      }
    }

    // Wait for ALL background flushes including the one we might have just started
    if (this.activeFlushes.size > 0) {
      this.logger.info(`Waiting for ${this.activeFlushes.size} pending background flushes...`);
      await Promise.all(this.activeFlushes);
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

  getHealth() {
    const now = performance.now();

    // Return cached result if still valid
    if (this._cachedHealth && (now - this._healthCacheTime) < this._healthCacheTTL) {
      return this._cachedHealth;
    }

    // Calculate health metrics
    const bufferUsage = (this.count / this.maxBatchSize) * 100;
    const errorRate = this.metrics.totalFlushes > 0
      ? (this.metrics.totalErrors / this.metrics.totalFlushes) * 100
      : 0;

    // Determine overall health (consider multiple factors)
    const healthy = errorRate < 10 && this.count < this.maxBatchSize * 0.9;

    const health = {
      healthy,
      bufferSize: this.count,
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

