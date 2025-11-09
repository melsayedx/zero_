/**
 * Log Repository Port (Interface)
 * Defines contract for log storage implementations
 */

class LogRepositoryPort {
  /**
   * Save a log entry
   * @param {LogEntry} logEntry 
   * @returns {Promise<void>}
   */
  async save(logEntry) {
    throw new Error('Method not implemented');
  }

  /**
   * Find logs by criteria
   * @param {Object} criteria 
   * @returns {Promise<Array>}
   */
  async find(criteria) {
    throw new Error('Method not implemented');
  }
}

module.exports = LogRepositoryPort;

