const LogLevel = require('../value-objects/log-level');
const Metadata = require('../value-objects/metadata');
const TraceId = require('../value-objects/trace-id');
const AppId = require('../value-objects/app-id');

/**
 * LogEntry Domain Entity - Core log entry representation with validation and performance optimization.
 *
 * This class represents a complete log entry in the logging platform, encapsulating all
 * log data with built-in validation, normalization, and optimized processing. It serves
 * as the primary domain object for log ingestion, validation, and storage operations.
 *
 * Key features:
 * - Comprehensive field validation with length and type constraints
 * - Lazy metadata JSON serialization to avoid upfront performance costs
 * - Immutable value object composition (AppId, LogLevel, Metadata, TraceId)
 * - Batch processing support for high-throughput scenarios
 * - Backward compatibility through fields object
 * - Memory-efficient instance creation with defensive copying
 * - ID field populated from database queries (not generated in application)
 *
 * @example
 * ```javascript
 * // Create a basic log entry (id will be null)
 * const logEntry = LogEntry.create({
 *   app_id: 'my-app',
 *   message: 'User logged in',
 *   level: 'INFO',
 *   source: 'auth-service'
 * });
 *
 * // Create with full data (id and timestamp always null for new entries)
 * const fullLog = LogEntry.create({
 *   id: 'ignored-id', // This will be ignored - new entries always get id = null
 *   app_id: 'production-app',
 *   message: 'Payment processed',
 *   level: 'WARN',
 *   source: 'payment-service',
 *   environment: 'production',
 *   metadata: { amount: 99.99 },
 *   trace_id: 'req-123',
 *   user_id: 'user-456',
 *   timestamp: Date.now() // This will be ignored - new entries always get timestamp = null
 * });
 *
 * // ID and timestamp handling - always null for new entries
 * console.log(log.id);              // null (new entry)
 * console.log(log.timestamp);       // null (new entry)
 * console.log(fullLog.id);          // null (id ignored, new entry)
 * console.log(fullLog.timestamp);   // null (timestamp ignored, new entry)
 *
 * // Access value objects
 * console.log(logEntry.level.value);     // 'INFO'
 * console.log(logEntry.appId.value);     // 'my-app'
 * console.log(logEntry.metadata.string); // '{"amount":99.99,"currency":"USD"}'
 *
 * // Access via toObject() for storage/serialization
 * const obj = logEntry.toObject();
 * console.log(obj.level);    // 'INFO'
 * console.log(obj.metadata); // '{"amount":99.99,"currency":"USD"}'
 * ```
 */
class LogEntry {
  /**
   * Private symbol to control constructor access and prevent external instantiation.
   * @type {symbol}
   */
  static #privateConstructor = Symbol('LogEntry.privateConstructor');

  /**
   * Field validation constraints for log entry properties.
   *
   * Defines length limits and optional flags for string fields.
   *
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
   *
   * @type {string[]}
   */
  static REQUIRED_FIELDS = ['app_id', 'message', 'level', 'source'];

  /**
   * Private constructor - use LogEntry.create() instead.
   *
   * This constructor is intentionally private and will throw an error if called directly.
   * LogEntry instances should only be created through the LogEntry.create() factory method.
   *
   * @param {symbol} secret - Private symbol for internal construction
   * @param {Object} data - Raw log entry data
   * @param {Object} [options={}] - Creation options
   * @throws {Error} Always throws when called without the private symbol
   * @private
   */
  constructor(secret, data = {}, options = {}) {
    // Private symbol to prevent external instantiation
    if (secret !== LogEntry.#privateConstructor) {
      throw new Error(
        'LogEntry cannot be instantiated directly. Use LogEntry.create() instead'
      );
    }

    const normalized = LogEntry.normalize(data);

    // Use value objects created by normalize
    this.appId = normalized.appId;
    this.level = normalized.level;
    this.metadata = normalized.metadata;
    this.traceId = normalized.traceId;

    // Store primitive values directly
    this.message = normalized.message;
    this.source = normalized.source;
    this.environment = normalized.environment;
    this.userId = normalized.user_id;
    this.id = normalized.id;
    this.timestamp = normalized.timestamp;

  }

  /**
   * Factory method to create a LogEntry instance.
   *
   * This is the primary way to create LogEntry instances. It ensures proper validation,
   * normalization, and always sets both id and timestamp to null for new entries
   * (database-generated). Any id or timestamp parameters passed in the data will be ignored.
   *
   * @param {Object} data - Raw log entry data
   * @param {Object} [options={}] - Creation options
   * @returns {LogEntry} New LogEntry instance
   *
   * @example
   * ```javascript
   * // Create a basic log entry
   * const log = LogEntry.create({
   *   app_id: 'my-app',
   *   message: 'User action',
   *   level: 'INFO',
   *   source: 'web-client'
   * });
   *
 * // Create with full data (id and timestamp always null for new entries)
 * const fullLog = LogEntry.create({
 *   id: 'ignored-id', // This will be ignored - new entries always get id = null
 *   app_id: 'production-app',
 *   message: 'Payment processed',
 *   level: 'WARN',
 *   source: 'payment-service',
 *   environment: 'production',
 *   metadata: { amount: 99.99 },
 *   trace_id: 'req-123',
 *   user_id: 'user-456',
 *   timestamp: Date.now() // This will be ignored - new entries always get timestamp = null
 * });
 *
 * // ID and timestamp handling - always null for new entries
 * console.log(log.id);              // null (new entry)
 * console.log(log.timestamp);       // null (new entry)
 * console.log(fullLog.id);          // null (id ignored, new entry)
 * console.log(fullLog.timestamp);   // null (timestamp ignored, new entry)
   * ```
   */
  static create(data = {}, options = {}) {
    // Force id and timestamp = null for new entries (database will generate)
    const dataWithNulls = { ...data, id: null, timestamp: null };
    return new LogEntry(LogEntry.#privateConstructor, dataWithNulls, options);
  }



  /**
   * Create multiple LogEntry instances asynchronously with batch processing and validation.
   *
   * Processes arrays of log entries, validating each entry and creating LogEntry instances.
   * Uses sub-batching for memory efficiency with large inputs and includes GC hints.
   * Forces id and timestamp to null for new entries (database-generated).
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
   * console.log(`${result.validEntries.length} valid, ${result.errors.length} errors`);
   * // Output: 2 valid, 1 errors
   * ```
   */
  static async createBatch(rawLogs, options = {}) {
    const batchSize = options.batchSize || 10000;
    const validEntries = [];
    const errors = [];

    // Process in sub-batches if large
    for (let i = 0; i < rawLogs.length; i += batchSize) {
      const batch = rawLogs.slice(i, i + batchSize);

      for (let j = 0; j < batch.length; j++) {
        const raw = batch[j];
        try {
          validEntries.push(LogEntry.create(raw, options));
        } catch (err) {
          errors.push({ data: raw, error: err.message });
        }
      }

      // Allow GC between sub-batches for very large inputs
      if (rawLogs.length > 100000 && i % 10000 === 0) {
        // Yield to event loop
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return { validEntries, errors };
  }

  /**
   * Convert to plain object for storage and serialization.
   *
   * Returns an object with primitive values suitable for database insertion
   * and JSON serialization.
   *
   * @returns {Object} Plain object with primitive values
   */
  toObject() {
    return {
      id: this.id,
      app_id: this.appId.value,
      message: this.message,
      source: this.source,
      level: this.level.value,
      environment: this.environment,
      metadata: this.metadata.string,
      trace_id: this.traceId.value,
      user_id: this.userId,
      timestamp: this.timestamp
    };
  }

  /**
   * Validate and normalize log entry data.
   *
   * Performs comprehensive validation on raw log data including required fields,
   * string constraints, and data types. Returns validated primitive data ready
   * for value object creation.
   *
   * @param {Object} data - Raw log entry data to validate and normalize
   * @returns {Object} Validated and normalized primitive log entry data
   *
   * @example
   * ```javascript
   * // Validate and normalize log data
   * const normalized = LogEntry.normalize({
   *   app_id: 'my-app',
   *   message: 'Test message',
   *   level: 'INFO',
   *   source: 'test'
   * });
   * // Result: { app_id: 'my-app', message: 'Test message', ... }
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

    // Create validated value objects - normalize handles creation centrally
    const appId = AppId.create(data.app_id);
    const level = LogLevel.get(data.level);
    const metadata = Metadata.create(data.metadata ?? {});
    const traceId = TraceId.create(data.trace_id);

    return {
      // Value objects for domain usage
      appId,
      level,
      metadata,
      traceId,
      // Primitives for direct access
      message: data.message,
      source: data.source,
      environment: data.environment,
      user_id: data.user_id ?? null,
      id: data.id,
      timestamp: data.timestamp
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

