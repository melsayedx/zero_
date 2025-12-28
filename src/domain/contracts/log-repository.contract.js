/** Abstract contract for log storage (ClickHouse, Redis, etc). */
class LogRepositoryContract {
  /**
   * Saves logs in batch.
   * @param {LogEntry[]} logEntries - Validated logs.
   * @returns {Promise<Object>} Operation result.
   * @throws {Error} If batch fails.
   */
  async save(logEntries) {
    throw new Error('Method not implemented: save()');
  }

  /**
   * Finds logs with pagination.
   * @param {Object} options - Query options.
   * @param {Object} [options.filter] - Filters.
   * @param {number} [options.limit] - Limit.
   * @param {Object} [options.cursor] - Cursor.
   * @param {Object} [options.sort] - Sort.
   * @returns {Promise<Object>} Paginated results.
   */
  async findBy({ filter = {}, limit = 100, cursor = null, sort = null }) {
    throw new Error('Method not implemented: findBy()');
  }

  /**
   * Returns performance stats.
   * @returns {Promise<Object>} Metrics (queue length, throughput).
   */
  async getStats() {
    throw new Error('Method not implemented: getStats()');
  }

  /**
   * Performs health check.
   * @returns {Promise<Object>} Health status.
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck()');
  }
}

module.exports = LogRepositoryContract;

