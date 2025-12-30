const LogLevel = require('../value-objects/log-level');
const Metadata = require('../value-objects/metadata');
const TraceId = require('../value-objects/trace-id');
const AppId = require('../value-objects/app-id');

class LogEntry {
  static CONSTRAINTS = {
    message: { minLength: 1, maxLength: 4096 },
    source: { minLength: 1, maxLength: 32 },
    environment: { minLength: 1, maxLength: 32, optional: true },
    user_id: { optional: true }
  };

  static REQUIRED_FIELDS = ['app_id', 'message', 'level', 'source', 'environment'];

  /**
   * Asynchronously processes a batch of log entries with validation.
   * @param {Array<Object>} rawLogs - Raw log entries.
   * @param {Object} [options] - Processing options.
   * @param {number} [options.batchSize=10000] - Sub-batch size.
   * @returns {Promise<{validEntries: Object[], errors: Array<{data: Object, error: string}>}>} Processing results.
   */
  static async createBatch(rawLogs, options = {}) {
    const batchSize = options.batchSize || 10000;
    const length = rawLogs.length;
    // Pre-allocate to avoid resizing.
    const validEntries = new Array(length);
    const errors = [];
    let validCount = 0;

    for (let i = 0; i < length; i += batchSize) {
      const end = Math.min(i + batchSize, length);

      for (let j = i; j < end; j++) {
        const raw = rawLogs[j];
        try {
          validEntries[validCount++] = LogEntry.normalize(raw);
        } catch (err) {
          errors.push({ data: raw, error: err.message });
        }
      }

      // Yield for GC on large inputs.
      if (length > 100000 && i % 10000 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Trim to actual size because we pre-allocated.
    validEntries.length = validCount;

    return { validEntries, errors };
  }


  /**
   * Validates and normalizes a single log entry.
   * @param {Object} data - Raw log data.
   * @returns {Object} Normalized primitive values.
   * @throws {Error} If validation fails.
   */
  static normalize(data = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('LogEntry data must be an object');
    }

    const missingFields = LogEntry.REQUIRED_FIELDS.filter((field) => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      throw new Error(`Missing required field(s): ${missingFields.join(', ')}`);
    }

    LogEntry._validateStringField('message', data.message, LogEntry.CONSTRAINTS.message);
    LogEntry._validateStringField('source', data.source, LogEntry.CONSTRAINTS.source);
    LogEntry._validateStringField('environment', data.environment, LogEntry.CONSTRAINTS.environment);
    LogEntry._validateStringField('user_id', data.user_id, LogEntry.CONSTRAINTS.user_id);

    const appId = new AppId(data.app_id);
    const level = LogLevel.get(data.level);
    const metadata = new Metadata(data.metadata ?? {});
    const traceId = new TraceId(data.trace_id);

    // Return camelCase (persistence handles snake_case).
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
   * Validates string length and type constraints.
   * @param {string} fieldName - Field name.
   * @param {*} value - Field value.
   * @param {Object} constraints - Validation rules.
   * @throws {Error} If validation fails.
   * @private
   */
  static _validateStringField(fieldName, value, constraints) {
    // Skip empty/optional fields.
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

