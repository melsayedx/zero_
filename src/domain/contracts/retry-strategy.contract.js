/**
 * RetryStrategyContract - Generic retry mechanism for failed operations.
 *
 * This contract defines a strategy pattern for handling failed operations.
 * Different implementations can use different storage backends (Redis, in-memory, etc.)
 * to persist and retry failed operations.
 *
 * Implementations should handle:
 * - Queuing failed operations with metadata
 * - Processing retry queues with backoff strategies
 * - Cleanup of successfully retried operations
 * - Monitoring and metrics collection
 *
 * @interface
 */
class RetryStrategyContract {
  /**
   * Queue a failed operation for retry
   * @param {Array} items - Items that failed to process
   * @param {Error} error - The error that caused the failure
   * @param {Object} metadata - Additional context (repository, config, etc.)
   * @returns {Promise<void>}
   */
  async queueForRetry(items, error, metadata) {
    throw new Error('queueForRetry must be implemented by subclass');
  }

  /**
   * Process pending retry operations
   * @returns {Promise<Object>} Processing results
   */
  async processRetries() {
    throw new Error('processRetries must be implemented by subclass');
  }

  /**
   * Get current retry queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    throw new Error('getStats must be implemented by subclass');
  }

  /**
   * Clean up resources during shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    throw new Error('shutdown must be implemented by subclass');
  }
}

module.exports = RetryStrategyContract;

