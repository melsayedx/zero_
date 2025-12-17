const LogLevel = require('../value-objects/log-level');
const Metadata = require('../value-objects/metadata');
const TraceId = require('../value-objects/trace-id');
const AppId = require('../value-objects/app-id');

/**
 * LogEntry Domain Entity - Log validation and normalization.
 *
 * This class provides static methods for validating and normalizing log entry data.
 * It uses value objects (AppId, LogLevel, Metadata, TraceId) internally for validation,
 * but returns plain objects with primitive values for easy database insertion.
 *
 * Key features:
 * - Comprehensive field validation with length and type constraints
 * - Value object validation for type safety
 * - Returns primitives for direct DB insertion
 * - Batch processing support for high-throughput scenarios
 *
 * @example
 * ```javascript
 * // Normalize a single log entry - returns primitives
 * const normalized = LogEntry.normalize({
 *   app_id: 'my-app',
 *   message: 'User logged in',
 *   level: 'INFO',
 *   source: 'auth-service'
 * });
 *
 * // All fields are now primitives (ready for DB)
 * logger.info(normalized.app_id);  // 'my-app'
 * logger.info(normalized.level);   // 'INFO'
 *
 * // Batch processing
 * const result = await LogEntry.createBatch(rawLogs);
 * logger.info(`${result.validEntries.length} valid`);
 * ```
 */
class LogEntry {
  /**
   * Field validation constraints for log entry properties.
   * @type {Object<string, {minLength?: number, maxLength?: number, optional?: boolean}>}
   */
  static CONSTRAINTS = {
    message: { minLength: 1, maxLength: 4096 },
    source: { minLength: 1, maxLength: 32 },
    environment: { minLength: 1, maxLength: 32, optional: true },
    user_id: { optional: true }
  };

  /**
   * Required fields that must be present and non-empty in every log entry.
   * @type {string[]}
   */
  static REQUIRED_FIELDS = ['app_id', 'message', 'level', 'source'];

  /**
   * Create multiple normalized log entry data objects asynchronously with batch processing and validation.
   *
   * Processes arrays of log entries, validating each entry and creating normalized data objects.
   * Uses sub-batching for memory efficiency with large inputs and includes GC hints.
   *
   * @param {Array<Object>} rawLogs - Array of raw log entry objects
   * @param {Object} [options={}] - Creation options
   * @param {number} [options.batchSize=1000] - Size of sub-batches for processing
   * @returns {Promise<{validEntries: LogEntry[], errors: Array<{data: Object, error: string}>}>}
   *          Promise resolving to object with valid entries and errors
   *
   * @example
   * ```javascript
   * const rawLogs = [
   *   { app_id: 'app1', message: 'Valid log', level: 'INFO', source: 'src1' },
   *   { app_id: 'app2', message: '', level: 'DEBUG', source: 'src2' }, // Invalid: empty message
   *   { app_id: 'app3', message: 'Another log', level: 'INFO', source: 'src3' }
   * ];
   *
   * const result = await LogEntry.createBatch(rawLogs);
   * logger.info(`${result.validEntries.length} valid, ${result.errors.length} errors`);
   * // Output: 2 valid, 1 errors
   * ```
   */
  static async createBatch(rawLogs, options = {}) {
    const batchSize = options.batchSize || 10000;
    const length = rawLogs.length;
    // Pre-allocate array with max possible size to avoid reallocation
    const validEntries = new Array(length);
    const errors = [];
    let validCount = 0;

    // Process in sub-batches if large
    for (let i = 0; i < length; i += batchSize) {
      const end = Math.min(i + batchSize, length);

      for (let j = i; j < end; j++) {
        const raw = rawLogs[j];
        try {
          // Use normalize() for consistency with worker validation
          // Returns plain objects with value objects, not LogEntry instances
          validEntries[validCount++] = LogEntry.normalize(raw);
        } catch (err) {
          errors.push({ data: raw, error: err.message });
        }
      }

      // Allow GC between sub-batches for very large inputs
      if (length > 100000 && i % 10000 === 0) {
        // Yield to event loop
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Trim array to actual size if some entries failed validation
    validEntries.length = validCount;

    return { validEntries, errors };
  }


  /**
   * Validate and normalize log entry data.
   *
   * Performs comprehensive validation on raw log data including required fields,
   * string constraints, and data types. Returns validated primitive data ready
   * for database insertion.
   *
   * @param {Object} data - Raw log entry data to validate and normalize
   * @returns {Object} Validated and normalized primitive log entry data
   *
   * @example
   * ```javascript
   * const normalized = LogEntry.normalize({
   *   app_id: 'my-app',
   *   message: 'Test message',
   *   level: 'INFO',
   *   source: 'test'
   * });
   * // Result: { app_id: 'my-app', level: 'INFO', message: 'Test message', ... }
   * ```
   */
  static normalize(data = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('LogEntry data must be an object');
    }

    // Validate required fields on raw data first (fail fast)
    const missingFields = LogEntry.REQUIRED_FIELDS.filter((field) => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      throw new Error(`Missing required field(s): ${missingFields.join(', ')}`);
    }

    // Validate string constraints on raw data
    LogEntry._validateStringField('message', data.message, LogEntry.CONSTRAINTS.message);
    LogEntry._validateStringField('source', data.source, LogEntry.CONSTRAINTS.source);
    LogEntry._validateStringField('environment', data.environment, LogEntry.CONSTRAINTS.environment);
    LogEntry._validateStringField('user_id', data.user_id, LogEntry.CONSTRAINTS.user_id);

    // Validate and extract primitive values from value objects
    const appId = AppId.create(data.app_id);
    const level = LogLevel.get(data.level);
    const metadata = Metadata.create(data.metadata ?? {});
    const traceId = TraceId.create(data.trace_id);

    // Return plain object with camelCase keys (JavaScript convention)
    // Persistence layer handles conversion to snake_case for database
    return {
      appId: appId.value,
      level: level.value,
      message: data.message,
      source: data.source,
      environment: data.environment ?? null,
      metadata: metadata.value,          // Object form for flexibility
      metadataString: metadata.string,   // Pre-serialized for ClickHouse
      traceId: traceId.value,
      userId: data.user_id ?? null
    };
  }

  /**
   * Validate a string field against the given constraints.
   *
   * Performs type checking and length validation for string fields.
   * Handles optional fields that can be null/undefined/empty.
   *
   * @param {string} fieldName - Name of the field being validated
   * @param {*} value - Value to validate
   * @param {Object} constraints - Validation constraints
   * @param {number} [constraints.minLength] - Minimum length requirement
   * @param {number} [constraints.maxLength] - Maximum length requirement
   * @param {boolean} [constraints.optional] - Whether field is optional
   * @throws {Error} If validation fails
   * @private
   */
  static _validateStringField(fieldName, value, constraints) {
    // Skip validation for optional fields that are null or undefined
    if (constraints?.optional === true && (value === null || value === undefined)) {
      return;
    }

    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    const min_constraint = constraints?.minLength !== undefined && value.length < constraints.minLength;
    const max_constraint = constraints?.maxLength !== undefined && value.length > constraints.maxLength;

    if (min_constraint || max_constraint) {
      throw new Error(`${fieldName} must be between ${constraints.minLength} and ${constraints.maxLength} characters`);
    }
  }

}

module.exports = LogEntry;

