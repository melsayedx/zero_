const IngestResult = require('./ingest-result');
const IngestLogContract = require('../../domain/contracts/ingest-log.contract');

/**
 * Core business logic for batch log ingestion 
 * with validation and performance optimization.
 *
 * @example
 * ```javascript
 * const result = await useCase.execute(logs);
 * ```
 */
class IngestLogUseCase extends IngestLogContract {
  constructor(logRepository, validationStrategy, logger) {
    super();

    this.logRepository = logRepository;
    this.validationStrategy = validationStrategy;
    this.logger = logger;
  }

  /**
   * Processes a batch of raw log data.
   * @param {Object[]} logsData - Array of raw log entry data
   * @returns {Promise<IngestResult>} Result with processing metrics and outcomes
   * @throws {Error} If input validation fails or all entries are invalid
   */
  async execute(logsData) {
    const startTime = performance.now();

    if (!logsData || logsData.length === 0) {
      throw new Error('Invalid input: must be an array of log entries');
    }

    const { validEntries: validLogEntries, errors } = await this.validationStrategy.validateBatch(logsData);

    // If no valid entries, throw an error for only the first 10 errors
    if (validLogEntries.length === 0) {
      const errorCount = errors.length;
      const truncatedErrors = errors.slice(0, 10).map(e => e.error).join(', ');
      const suffix = errorCount > 10 ? `... and ${errorCount - 10} more` : '';
      throw new Error(`All log entries failed validation: ${truncatedErrors}${suffix}`);
    }

    await this.logRepository.save(validLogEntries);

    const processingTime = performance.now() - startTime;
    const throughput = processingTime <= 0
      ? logsData.length * 1000 // Infinite throughput theoretically, but cap at instantaneous
      : (logsData.length / processingTime) * 1000;

    return new IngestResult({
      accepted: validLogEntries.length,
      rejected: errors.length,
      errors: errors,
      processingTime,
      throughput
    });
  }

}

module.exports = IngestLogUseCase;

