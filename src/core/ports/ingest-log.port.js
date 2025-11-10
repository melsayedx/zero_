/**
 * IngestLog Port (Input Port / Primary Port)
 * Defines the contract for ingesting log entries
 * 
 * This is the interface that primary adapters (controllers) depend on
 */
class IngestLogPort {
  /**
   * Execute the log ingestion operation
   * @param {Object} logData - Raw log data
   * @returns {Promise<Object>} Result with success/failure status
   */
  async execute(logData) {
    throw new Error('Method not implemented: execute()');
  }
}

module.exports = IngestLogPort;

