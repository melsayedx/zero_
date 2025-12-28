class IngestLogContract {
  /**
   * Executes log ingestion.
   *
   * @param {Object[]} logsData - Raw log entries.
   * @throws {Error} If not implemented.
   */
  async execute(logsData) {
    throw new Error('Method not implemented: execute()');
  }
}

/**
 * @typedef {IngestLogContract} IngestLogContract
 * @property {Function} execute - Execute log ingestion operation
 */

module.exports = IngestLogContract;

