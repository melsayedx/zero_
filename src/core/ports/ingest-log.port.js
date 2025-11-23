/**
 * IngestLogPort - Input port for log ingestion operations.
 *
 * This abstract class defines the contract for log ingestion use cases in the
 * hexagonal architecture. It serves as an input port (primary port) that
 * primary adapters (controllers, API handlers) depend on to execute log
 * ingestion operations.
 *
 * Key features:
 * - Defines the interface for log ingestion operations
 * - Ensures consistent contract across different implementations
 * - Supports dependency inversion principle
 * - Enables testing with mocks and stubs
 *
 * @example
 * ```javascript
 * // Implementation example
 * class LogIngestionUseCase extends IngestLogPort {
 *   async execute(logsData) {
 *     // Validate and process logs
 *     const result = await this.processLogs(logsData);
 *     return result;
 *   }
 * }
 *
 * // Usage in controller
 * class LogController {
 *   constructor(logIngestionPort) {
 *     this.logIngestionPort = logIngestionPort; // IngestLogPort
 *   }
 *
 *   async ingestLogs(request) {
 *     const result = await this.logIngestionPort.execute(request.body);
 *     return { status: 200, body: result };
 *   }
 * }
 * ```
 */
class IngestLogPort {
  /**
   * Execute the log ingestion operation.
   *
   * This method must be implemented by concrete use case classes to provide
   * the actual log ingestion logic including validation, processing, and persistence.
   *
   * @param {Object[]} logsData - Array of raw log entry data
   * @returns {Promise<IngestResult>} Result with processing metrics and outcomes
   *
   * @throws {Error} If method is not implemented by concrete class
   *
   * @example
   * ```javascript
   * // Concrete implementation
   * async execute(logsData) {
   *   // Validate input
   *   if (!Array.isArray(logsData)) {
 *     throw new Error('Input must be an array');
 *   }
 *
 *   // Process logs and return result
 *   const { validEntries, errors } = await this.validateBatch(logsData);
 *   await this.saveLogs(validEntries);
 *
 *   return new IngestResult({
 *     accepted: validLogEntries.length,
 *     rejected: errors.length,
 *     errors: errors,
 *     processingTime: Date.now() - startTime,
 *     throughput: calculateThroughput(validEntries.length, processingTime)
 *   });
 * }
 * ```
   */
  async execute(logsData) {
    throw new Error('Method not implemented: execute()');
  }
}

/**
 * @typedef {IngestLogPort} IngestLogPort
 * @property {Function} execute - Execute log ingestion operation
 */

module.exports = IngestLogPort;

