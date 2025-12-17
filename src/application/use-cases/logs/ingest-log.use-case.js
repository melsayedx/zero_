const IngestResult = require('./ingest-result');
const IngestLogContract = require('../../../domain/contracts/ingest-log.contract');

/**
 * IngestLog Use Case - Core business logic for batch log ingestion.
 *
 * This class handles the batch ingestion of log entries with validation, processing,
 * and performance optimization. It coordinates between input validation and persistence
 * while providing comprehensive error handling and metrics for high-throughput scenarios.
 *
 * Key features:
 * - Batch validation and processing for high throughput
 * - Comprehensive error collection and reporting
 * - Performance metrics and throughput calculation
 * - Memory-efficient processing for large batches
 * - Clean separation between validation and persistence
 *
 * @example
 * ```javascript
 * const useCase = new IngestLogUseCase(logRepository);
 *
 * const logs = [
 *   { app_id: 'my-app', message: 'User logged in', level: 'INFO', source: 'auth' },
 *   { app_id: 'my-app', message: 'Payment processed', level: 'INFO', source: 'billing' }
 * ];
 *
 * const result = await useCase.execute(logs);
 * logger.info(`${result.accepted} logs accepted, ${result.rejected} rejected`);
 * logger.info(`Processed at ${result.throughput} logs/second`);
 * ```
 */
class IngestLogUseCase extends IngestLogContract {
  /**
   * Create an IngestLogUseCase instance.
   *
   * @param {LogRepository} logRepository - Repository for persisting log entries
   * @param {ValidationStrategyContract} validationStrategy - Strategy for validating log entries
   */
  constructor(logRepository, validationStrategy) {
    super();
    if (!logRepository || typeof logRepository.save !== 'function') {
      throw new Error('LogRepository is required and must implement the save() method');
    }
    if (!validationStrategy || typeof validationStrategy.validateBatch !== 'function') {
      throw new Error('ValidationStrategy is required and must implement the validateBatch() method');
    }
    this.logRepository = logRepository;
    this.validationStrategy = validationStrategy;
  }

  /**
   * Set the validation strategy at runtime.
   *
   * @param {ValidationStrategyContract} strategy - New validation strategy
   * @throws {Error} If strategy doesn't implement validateBatch()
   */
  setValidationStrategy(strategy) {
    if (!strategy || typeof strategy.validateBatch !== 'function') {
      throw new Error('ValidationStrategy must implement the validateBatch() method');
    }
    this.validationStrategy = strategy;
  }

  /**
   * Execute the log ingestion use case.
   *
   * Processes an array of raw log data through batch validation and persistence.
   * Returns comprehensive results including acceptance/rejection counts,
   * errors, and performance metrics.
   *
   * @param {Object[]} logsData - Array of raw log entry data
   * @returns {Promise<IngestResult>} Result with processing metrics and outcomes
   *
   * @throws {Error} If input validation fails or all entries are invalid
   *
   * @example
   * ```javascript
   * // Basic usage
   * const result = await useCase.execute([
   *   { app_id: 'app1', message: 'Log 1', level: 'INFO', source: 'api' },
   *   { app_id: 'app2', message: 'Log 2', level: 'ERROR', source: 'db' }
   * ]);
   *
   * // Check results
   * if (result.accepted > 0) {
   *   logger.info(`Successfully ingested ${result.accepted} logs`);
   * }
   *
   * if (result.rejected > 0) {
   *   logger.info(`${result.rejected} logs were rejected due to validation errors`);
   * }
   * ```
   */
  async execute(logsData) {
    const startTime = Date.now();

    if (!Array.isArray(logsData) || logsData.length === 0) {
      throw new Error('Input must be an array of log entries');
    }

    const { validEntries: validLogEntries, errors } = await this.validationStrategy.validateBatch(logsData);

    if (validLogEntries.length === 0) {
      const errorMessages = errors.map(error => error.error).join(', ');
      throw new Error(`All log entries failed validation: ${errorMessages}`);
    }

    await this.logRepository.save(validLogEntries);

    const processingTime = Date.now() - startTime;
    const throughput = processingTime === 0
      ? logsData.length
      : (logsData.length / processingTime) * 1000;

    return new IngestResult({
      accepted: validLogEntries.length,
      rejected: errors.length,
      errors: errors.slice(0, 100),
      processingTime,
      throughput
    });
  }


}

module.exports = IngestLogUseCase;

