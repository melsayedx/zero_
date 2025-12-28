class RetryStrategyContract {
  /**
   * Queues operation for retry.
   * @param {Array} items - Failed items.
   * @param {Error} error - Failure cause.
   * @param {Object} metadata - Context data.
   * @returns {Promise<void>}
   */
  async queueForRetry(items, error, metadata) {
    throw new Error('queueForRetry must be implemented by subclass');
  }

  /**
   * Processes retry queue.
   * @returns {Promise<Object>} Results.
   */
  async processRetries() {
    throw new Error('processRetries must be implemented by subclass');
  }

  async getStats() {
    throw new Error('getStats must be implemented by subclass');
  }

  async shutdown() {
    throw new Error('shutdown must be implemented by subclass');
  }
}

module.exports = RetryStrategyContract;

