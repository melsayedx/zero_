const LogEntry = require('../entities/log-entry');
const IngestResult = require('./ingest-result');
const IngestLogPort = require('../ports/ingest-log.port');

/**
 * IngestLog Use Case
 * Core business logic for ingesting log entries with performance optimization
 *
 * Architecture:
 * - Depends on: LogRepositoryPort (output port) - what this use case needs
 * - Depends on: IngestResult - what this use case returns
 *
 * This follows the Dependency Inversion Principle and Hexagonal Architecture
 */
class IngestLogUseCase extends IngestLogPort {
  constructor(logRepository) {
    super();
    if (!logRepository  || typeof logRepository.save !== 'function') {
      throw new Error('LogRepository is required and must implement the save() method');
    }
    this.logRepository = logRepository;
  }

  /**
   * Execute the use case with full validation (default)
   * Uses optimized batch validation for better performance
   * @param {Object[]} logsData - Array of raw log data
   * @returns {Promise<IngestResult>} Result with success/failure status
   */
  async execute(logsData) {
    return this._executeWithBatchValidation(logsData, { validationMode: 'batch' });
  }

  /**
   * Execute with light validation for high-throughput
   * Uses ultra-fast batch validation
   * @param {Object[]} logsData - Array of raw log data
   * @returns {Promise<IngestResult>} Result with performance metrics
   */
  async executeFast(logsData) {
    return this._executeWithBatchValidation(logsData, { validationMode: 'batch-fast' });
  }

  /**
   * Execute with no validation for maximum throughput (trust caller)
   * @param {Object[]} logsData - Array of raw log data
   * @returns {Promise<IngestResult>} Result with performance metrics
   */
  async executeUnsafe(logsData) {
    return this._executeWithValidation(logsData, { validationMode: 'skip' });
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use execute() which now uses batch validation
   */
  async executeLegacy(logsData) {
    return this._executeWithValidation(logsData, { validationMode: 'full' });
  }

  /**
   * Internal execution with optimized batch validation
   * @private
   */
  async _executeWithBatchValidation(logsData, options = {}) {
    const startTime = Date.now();
    const { validationMode = 'batch' } = options;

    // Validate input
    if (!Array.isArray(logsData) || logsData.length === 0) {
      throw new Error('Input must be an array of log entries');
    }

    // Use optimized batch validation
    const validationResult = validationMode === 'batch-fast'
      ? LogEntry.validateBatchFast(logsData)
      : LogEntry.validateBatch(logsData);

    const { validEntries: validLogEntries, errors } = validationResult;

    // If all logs failed validation, return error
    if (validLogEntries.length === 0) {
      const errorMessages = errors.map(error => error.error).join(', ');
      throw new Error(`All log entries failed validation: ${errorMessages}`);
    }

    // Save via repository port
    await this.logRepository.save(validLogEntries);

    // Calculate performance metrics
    const processingTime = Date.now() - startTime;
    const throughput = (logsData.length / processingTime) * 1000; // logs per second

    // Return detailed result with performance metrics
    return new IngestResult({
      accepted: validLogEntries.length,
      rejected: errors.length,
      errors: errors.slice(0, 100), // Limit error details to first 100
      processingTime,
      throughput,
      validationMode
    });
  }

  /**
   * Internal execution with configurable validation (legacy individual validation)
   * @private
   */
  async _executeWithValidation(logsData, options = {}) {
    const startTime = Date.now();
    const { validationMode = 'full' } = options;

    // Validate input
    if (!Array.isArray(logsData) || logsData.length === 0) {
      throw new Error('Input must be an array of log entries');
    }

    // Choose validation strategy
    const createEntity = this._getEntityFactory(validationMode);

    // Bulk validation with error collection (legacy approach)
    const { validLogEntries, errors } = this._bulkValidate(logsData, createEntity);

    // If all logs failed validation, return error
    if (validLogEntries.length === 0) {
      const errorMessages = errors.map(error => error.error).join(', ');
      throw new Error(`All log entries failed validation: ${errorMessages}`);
    }

    // Save via repository port
    await this.logRepository.save(validLogEntries);

    // Calculate performance metrics
    const processingTime = Date.now() - startTime;
    const throughput = (logsData.length / processingTime) * 1000; // logs per second

    // Return detailed result with performance metrics
    return new IngestResult({
      accepted: validLogEntries.length,
      rejected: errors.length,
      errors: errors.slice(0, 100), // Limit error details to first 100
      processingTime,
      throughput,
      validationMode
    });
  }

  /**
   * Get entity factory based on validation mode
   * @private
   */
  _getEntityFactory(validationMode) {
    switch (validationMode) {
      case 'light':
        return LogEntry.createFast;
      case 'skip':
        return LogEntry.createUnsafe;
      case 'full':
      default:
        return (data) => new LogEntry(data);
    }
  }

  /**
   * Bulk validation with efficient error collection
   * @private
   */
  _bulkValidate(logsData, createEntity) {
    const validLogEntries = [];
    const errors = [];

    // Use for loop for better performance than forEach/map
    for (let i = 0; i < logsData.length; i++) {
      try {
        validLogEntries.push(createEntity(logsData[i]));
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: logsData[i]
        });
      }
    }

    return { validLogEntries, errors };
  }
}

module.exports = IngestLogUseCase;

