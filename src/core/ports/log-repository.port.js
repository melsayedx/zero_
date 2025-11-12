/**
 * LogRepository Port (Interface)
 * Defines the contract for log storage implementations
 */
class LogRepositoryPort {
  /**
   * Save multiple log entries in batch (optimized for performance)
   * @param {LogEntry[]} logEntries - Array of log entries to save
   * @returns {Promise<Object>} Result with count of saved logs and performance metrics
   */
  async save(logEntries) {
    throw new Error('Method not implemented: save()');
  }

  /**
   * Save logs with different validation modes for performance
   * @param {Object[]} rawLogs - Raw log data
   * @param {Object} options - Validation options { skipValidation, lightValidation }
   * @returns {Promise<Object>} Result with metrics
   */
  async saveBulk(rawLogs, options = {}) {
    throw new Error('Method not implemented: saveBulk()');
  }

  /**
   * Find logs by filter with performance optimization
   * @param {Object} options
   * @param {Object} options.filter - Filter conditions
   * @param {number} options.limit - Maximum number of logs to return (default: 100)
   * @param {Object} options.cursor - Pagination cursor
   * @param {Object} options.sort - Sort options { field, order }
   * @returns {Promise<Object>} { logs, nextCursor, hasMore, queryTime }
   */
  async findBy({ filter = {}, limit = 100, cursor = null, sort = null }) {
    throw new Error('Method not implemented: findBy()');
  }

  /**
   * Get performance statistics
   * @returns {Promise<Object>} Performance metrics
   */
  async getStats() {
    throw new Error('Method not implemented: getStats()');
  }

  /**
   * Health check for the repository
   * @returns {Promise<Object>} { healthy, latency, version }
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck()');
  }

  /**
   * Bulk health check for multiple operations
   * @param {string[]} operations - Operations to test
   * @returns {Promise<Object>} Health status for each operation
   */
  async healthCheckBulk(operations = ['read', 'write']) {
    throw new Error('Method not implemented: healthCheckBulk()');
  }
}

module.exports = LogRepositoryPort;

