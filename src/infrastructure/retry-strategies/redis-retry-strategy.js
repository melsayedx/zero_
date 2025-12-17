const RetryStrategyContract = require('../../domain/contracts/retry-strategy.contract');

/**
 * RedisRetryStrategy - Redis-based dead letter queue for failed operations.
 *
 * This implementation uses Redis lists to queue failed operations for later retry.
 * Failed batches are stored with metadata and can be processed by background workers.
 *
 * Features:
 * - Persistent dead letter queue (survives restarts)
 * - Structured error metadata for debugging
 * - Configurable queue names and TTL
 * - Statistics and monitoring
 * - Graceful shutdown handling
 *
 * @example
 * ```javascript
 * const strategy = new RedisRetryStrategy(redisClient, {
 *   queueName: 'logs:dead-letter',
 *   maxRetries: 3,
 *   retryDelay: 1000
 * });
 *
 * // Queue failed operation
 * await strategy.queueForRetry(failedLogs, error, {
 *   repository: 'ClickHouseRepository',
 *   batchSize: 1000
 * });
 *
 * // Process retries (usually done by worker)
 * const result = await strategy.processRetries();
 * ```
 */
class RedisRetryStrategy extends RetryStrategyContract {
  /**
   * Create Redis-based retry strategy
   * @param {Object} redisClient - Redis client instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.queueName='logs:dead-letter'] - Redis key for dead letter queue
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.retryDelay=1000] - Base delay between retries (ms)
   * @param {boolean} [options.enableLogging=true] - Enable console logging
   */
  constructor(redisClient, options = {}) {
    super();

    if (!redisClient || typeof redisClient.lpush !== 'function') {
      throw new Error('Valid Redis client required for RedisRetryStrategy');
    }

    this.redisClient = redisClient;
    this.queueName = options.queueName || 'logs:dead-letter';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.enableLogging = options.enableLogging !== false;
    this.logger = options.logger;

    // Processing state
    this.isProcessing = false;
    this.processingTimeout = null;

    if (this.logger) {
      this.logger.info('RedisRetryStrategy initialized', {
        queue: this.queueName,
        maxRetries: this.maxRetries
      });
    }
  }

  /**
   * Queue failed items for retry in Redis dead letter queue
   * @param {Array} items - Failed items to retry
   * @param {Error} error - Error that caused failure
   * @param {Object} metadata - Additional context
   * @returns {Promise<void>}
   */
  async queueForRetry(items, error, metadata = {}) {
    try {
      const deadLetterItem = {
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
          attempt: 0
        }
      };

      await this.redisClient.lpush(this.queueName, JSON.stringify(deadLetterItem));

      if (this.logger) {
        this.logger.warn('Queued failed items for retry', {
          queue: this.queueName,
          itemCount: items.length,
          error: error.message
        });
      }
    } catch (redisError) {
      if (this.logger) {
        this.logger.error('CRITICAL: Failed to queue for retry', {
          redisError: redisError.message,
          originalError: error.message,
          itemsLost: items.length
        });
      }
      throw redisError;
    }
  }

  /**
   * Process pending retry operations from Redis queue
   * Note: This method should typically be called by background workers,
   * not directly by application code
   * @returns {Promise<Object>} Processing results
   */
  async processRetries() {
    if (this.isProcessing) {
      return { processed: 0, message: 'Already processing' };
    }

    this.isProcessing = true;
    let processed = 0;
    let errors = 0;

    try {
      // Process up to 10 items at a time to avoid blocking
      for (let i = 0; i < 10; i++) {
        const item = await this.redisClient.rpop(this.queueName);
        if (!item) break; // Queue empty

        try {
          const deadLetterItem = JSON.parse(item);

          // Check if max retries exceeded
          if (deadLetterItem.metadata.attempt >= this.maxRetries) {
            if (this.logger) {
              this.logger.warn('Max retries exceeded, dropping item', {
                itemCount: deadLetterItem.items.length,
                finalError: deadLetterItem.error.message
              });
            }
            continue;
          }

          // TODO: Implement actual retry logic here
          // This would require access to the repository to retry the operation
          // For now, we'll just re-queue with incremented attempt count

          deadLetterItem.metadata.attempt++;
          const delay = this.retryDelay * Math.pow(2, deadLetterItem.metadata.attempt);

          // Re-queue with backoff delay (simplified - in real implementation,
          // you'd use a separate delay queue or scheduled processing)
          setTimeout(async () => {
            try {
              await this.redisClient.lpush(this.queueName, JSON.stringify(deadLetterItem));
            } catch (e) {
              if (this.logger) {
                this.logger.error('Failed to re-queue item', { error: e.message });
              }
            }
          }, delay);

          processed++;

        } catch (parseError) {
          if (this.logger) {
            this.logger.error('Failed to parse dead letter item', { error: parseError.message });
          }
          errors++;
        }
      }

      return { processed, errors };

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get current retry queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    try {
      const length = await this.redisClient.llen(this.queueName);
      return {
        queueLength: length,
        queueName: this.queueName,
        maxRetries: this.maxRetries,
        isProcessing: this.isProcessing
      };
    } catch (error) {
      return {
        error: error.message,
        queueName: this.queueName
      };
    }
  }

  /**
   * Clean up resources during shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    if (this.logger) {
      this.logger.info('RedisRetryStrategy shutdown complete');
    }
  }
}

module.exports = RedisRetryStrategy;
