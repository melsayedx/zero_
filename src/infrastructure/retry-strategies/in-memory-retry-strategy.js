const RetryStrategyContract = require('../../domain/contracts/retry-strategy.contract');

/**
 * InMemoryRetryStrategy - In-memory retry queue for development/testing.
 *
 * This implementation uses in-memory storage for retry queues. It's suitable for:
 * - Development and testing environments
 * - Scenarios where persistence across restarts is not required
 * - Simple applications with low failure rates
 *
 * Note: Failed operations are lost on restart - use RedisRetryStrategy for production.
 *
 * @example
 * ```javascript
 * const strategy = new InMemoryRetryStrategy({
 *   maxRetries: 3,
 *   retryDelay: 1000
 * });
 *
 * // Queue failed operation
 * await strategy.queueForRetry(failedLogs, error, { repository: 'TestRepo' });
 * ```
 */
class InMemoryRetryStrategy extends RetryStrategyContract {
  /**
   * Create in-memory retry strategy
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.retryDelay=1000] - Base delay between retries (ms)
   * @param {boolean} [options.enableLogging=true] - Enable console logging
   */
  constructor(options = {}) {
    super();

    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.logger = options.logger;

    // In-memory storage
    this.retryQueue = [];
    this.timeouts = new Map();
    this.isProcessing = false;

    // Metrics
    this.metrics = {
      queued: 0,
      processed: 0,
      failed: 0,
      retries: 0
    };

    this.logger.info('InMemoryRetryStrategy initialized for development/testing');
  }

  /**
   * Queue failed items for retry in memory
   * @param {Array} items - Failed items to retry
   * @param {Error} error - Error that caused failure
   * @param {Object} metadata - Additional context
   * @returns {Promise<void>}
   */
  async queueForRetry(items, error, metadata = {}) {
    const retryItem = {
      items,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack
      },
      metadata: {
        ...metadata,
        queuedAt: new Date().toISOString(),
        itemCount: items.length,
        attempt: 0,
        id: Date.now() + Math.random()
      }
    };

    this.retryQueue.push(retryItem);
    this.metrics.queued++;

    // Schedule immediate processing (or with delay)
    this._scheduleProcessing(retryItem);

    this.logger.warn('Queued failed items for retry', {
      itemCount: items.length,
      error: error.message,
      queueLength: this.retryQueue.length
    });
  }

  /**
   * Process pending retry operations
   * @returns {Promise<Object>} Processing results
   */
  async processRetries() {
    if (this.isProcessing || this.retryQueue.length === 0) {
      return { processed: 0, remaining: this.retryQueue.length };
    }

    this.isProcessing = true;
    let processed = 0;

    try {
      // Process all ready items (attempt = 0 or delay expired)
      const now = Date.now();
      const readyItems = this.retryQueue.filter(item => {
        if (item.metadata.attempt === 0) return true;

        const delay = this.retryDelay * Math.pow(2, item.metadata.attempt);
        const scheduledTime = new Date(item.metadata.queuedAt).getTime() +
          (delay * item.metadata.attempt);

        return now >= scheduledTime;
      });

      for (const item of readyItems) {
        // Remove from queue
        const index = this.retryQueue.indexOf(item);
        if (index > -1) {
          this.retryQueue.splice(index, 1);
        }

        // Check max retries
        if (item.metadata.attempt >= this.maxRetries) {
          this.metrics.failed++;
          this.logger.warn('Max retries exceeded, dropping item', {
            itemCount: item.items.length,
            finalError: item.error.message
          });
          continue;
        }

        try {
          // TODO: Implement actual retry logic
          // In a real implementation, this would attempt to reprocess the items
          // For now, we'll simulate by incrementing attempt and re-queuing

          item.metadata.attempt++;
          this.metrics.retries++;

          if (item.metadata.attempt < this.maxRetries) {
            // Re-queue for another attempt
            item.metadata.queuedAt = new Date().toISOString();
            this.retryQueue.push(item);
            this._scheduleProcessing(item);
          } else {
            this.metrics.failed++;
            this.logger.warn('Item failed permanently after retries');
          }

          processed++;

        } catch (retryError) {
          // Retry failed, re-queue if attempts remaining
          item.metadata.attempt++;
          if (item.metadata.attempt < this.maxRetries) {
            item.metadata.queuedAt = new Date().toISOString();
            this.retryQueue.push(item);
            this._scheduleProcessing(item);
          } else {
            this.metrics.failed++;
          }
        }
      }

      return {
        processed,
        remaining: this.retryQueue.length,
        metrics: { ...this.metrics }
      };

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Schedule processing for a retry item
   * @private
   */
  _scheduleProcessing(item) {
    const delay = item.metadata.attempt === 0 ? 0 :
      this.retryDelay * Math.pow(2, item.metadata.attempt);

    const timeout = setTimeout(async () => {
      this.timeouts.delete(item.metadata.id);
      await this.processRetries();
    }, delay);

    this.timeouts.set(item.metadata.id, timeout);
  }

  /**
   * Get current retry queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    return {
      queueLength: this.retryQueue.length,
      maxRetries: this.maxRetries,
      isProcessing: this.isProcessing,
      metrics: { ...this.metrics },
      memoryOnly: true // Indicates this is not persistent
    };
  }

  /**
   * Clean up resources during shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Clear all pending timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.retryQueue.length = 0;

    this.logger.info('InMemoryRetryStrategy shutdown complete - all data cleared');
  }
}

module.exports = InMemoryRetryStrategy;
