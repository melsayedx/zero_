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
   * Optional: Health check for the repository
   * @returns {Promise<boolean>} Connection status
   */
  async healthCheck() {
    throw new Error('Method not implemented: healthCheck()');
  }
}

module.exports = LogRepositoryPort;

