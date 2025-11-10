/**
 * LogRepository Port (Interface)
 * Defines the contract for log storage implementations
 */
class LogRepositoryPort {
  /**
   * Save a log entry
   * @param {LogEntry} logEntry - The log entry to save
   * @returns {Promise<Object>} Result with success status and saved entry
   */
  async save(logEntry) {
    throw new Error('Method not implemented: save()');
  }

  /**
   * Save multiple log entries in batch (optimized for performance)
   * @param {LogEntry[]} logEntries - Array of log entries to save
   * @returns {Promise<Object>} Result with count of saved logs
   */
  async saveBatch(logEntries) {
    throw new Error('Method not implemented: saveBatch()');
  }

  /**
   * Optional: Health check for the repository
   * @returns {Promise<boolean>} Connection status
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck()');
  }
}

module.exports = LogRepositoryPort;

