const { randomUUID } = require('crypto');

/**
 * LogEntry Domain Entity
 * Represents a log entry with performance-optimized validation
 */
class LogEntry {
  // Valid log levels
  static VALID_LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);

  // Field constraints
  static CONSTRAINTS = {
    app_id: { minLength: 1, maxLength: 100 },
    message: { minLength: 1, maxLength: 10000 },
    source: { minLength: 1, maxLength: 64 },
    environment: { minLength: 1, maxLength: 32 },
    metadata: { maxSizeBytes: 16384 } // 16KB
  };

  // Fast UUID validation (simplified for performance)
  static UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(data, options = {}) {
    const { skipValidation = false, lightValidation = false } = options;

    // ===== NORMALIZATION =====
    const id = data.id || randomUUID();
    const level = data.level?.toUpperCase();
    const metadata = data.metadata ?? {};
    const environment = data.environment || 'prod';
    const trace_id = data.trace_id ?? null;
    const user_id = data.user_id ?? null;
    const app_id = data.app_id;
    const message = data.message;
    const source = data.source;
    
    // Timestamp - only set when reading from database (not for insertion)
    const timestamp = data.timestamp || null;

    // ===== SKIP VALIDATION FOR MAXIMUM PERFORMANCE =====
    if (skipValidation) {
      // Direct assignment without validation (trust the caller)
      this.id = id;
      this.app_id = app_id;
      this.timestamp = timestamp;
      this.level = level;
      this.message = message;
      this.source = source;
      this.environment = environment;
      this.metadata = metadata;
      this.trace_id = trace_id;
      this.user_id = user_id;
      return;
    }

    // ===== LIGHT VALIDATION FOR HIGH-THROUGHPUT =====
    if (lightValidation) {
      this._lightValidate({ id, app_id, timestamp, level, message, source, environment, metadata, trace_id, user_id });
      return;
    }

    // ===== REQUIRED FIELDS VALIDATION =====
    if (!app_id) throw new Error('Missing required field: app_id');
    if (!message) throw new Error('Missing required field: message');
    if (!level) throw new Error('Missing required field: level');
    if (!source) throw new Error('Missing required field: source');

    // ===== ID VALIDATION =====
    if (typeof id !== 'string') {
      throw new Error('id must be a string');
    }
    if (!LogEntry.UUID_REGEX.test(id)) {
      throw new Error('id must be a valid UUID');
    }

    // ===== APP_ID VALIDATION =====
    if (typeof app_id !== 'string') {
      throw new Error('app_id must be a string');
    }
    if (app_id.length < LogEntry.CONSTRAINTS.app_id.minLength) {
      throw new Error(`app_id must be at least ${LogEntry.CONSTRAINTS.app_id.minLength} character(s)`);
    }
    if (app_id.length > LogEntry.CONSTRAINTS.app_id.maxLength) {
      throw new Error(`app_id must not exceed ${LogEntry.CONSTRAINTS.app_id.maxLength} characters`);
    }

    // ===== LEVEL VALIDATION =====
    if (typeof level !== 'string') {
      throw new Error('level must be a string');
    }
    if (!LogEntry.VALID_LEVELS.has(level)) {
      throw new Error(`level must be one of: ${Array.from(LogEntry.VALID_LEVELS).join(', ')}`);
    }

    // ===== MESSAGE VALIDATION =====
    if (typeof message !== 'string') {
      throw new Error('message must be a string');
    }
    if (message.length < LogEntry.CONSTRAINTS.message.minLength) {
      throw new Error(`message must be at least ${LogEntry.CONSTRAINTS.message.minLength} character(s)`);
    }
    if (message.length > LogEntry.CONSTRAINTS.message.maxLength) {
      throw new Error(`message must not exceed ${LogEntry.CONSTRAINTS.message.maxLength} characters`);
    }

    // ===== SOURCE VALIDATION =====
    if (typeof source !== 'string') {
      throw new Error('source must be a string');
    }
    if (source.length < LogEntry.CONSTRAINTS.source.minLength) {
      throw new Error(`source must be at least ${LogEntry.CONSTRAINTS.source.minLength} character(s)`);
    }
    if (source.length > LogEntry.CONSTRAINTS.source.maxLength) {
      throw new Error(`source must not exceed ${LogEntry.CONSTRAINTS.source.maxLength} characters`);
    }

    // ===== ENVIRONMENT VALIDATION =====
    if (typeof environment !== 'string') {
      throw new Error('environment must be a string');
    }
    if (environment.length < LogEntry.CONSTRAINTS.environment.minLength) {
      throw new Error(`environment must be at least ${LogEntry.CONSTRAINTS.environment.minLength} character(s)`);
    }
    if (environment.length > LogEntry.CONSTRAINTS.environment.maxLength) {
      throw new Error(`environment must not exceed ${LogEntry.CONSTRAINTS.environment.maxLength} characters`);
    }

    // ===== METADATA VALIDATION =====
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error('metadata must be an object');
    }
    const metadataStr = JSON.stringify(metadata);
    if (metadataStr.length > LogEntry.CONSTRAINTS.metadata.maxSizeBytes) {
      throw new Error(`metadata exceeds size limit of ${LogEntry.CONSTRAINTS.metadata.maxSizeBytes} bytes`);
    }

    // ===== TRACE_ID VALIDATION =====
    if (trace_id !== null && typeof trace_id !== 'string') {
      throw new Error('trace_id must be a string or null');
    }

    // ===== USER_ID VALIDATION =====
    if (user_id !== null && typeof user_id !== 'string') {
      throw new Error('user_id must be a string or null');
    }

    // ===== ASSIGNMENT =====
    this.id = id;
    this.app_id = app_id;
    this.level = level;
    this.message = message;
    this.source = source;
    this.environment = environment;
    this.metadata = metadata;
    this.trace_id = trace_id;
    this.user_id = user_id;
  }

  /**
   * Light validation for high-throughput scenarios
   * @private
   */
  _lightValidate({ id, app_id, level, message, source, environment, metadata, trace_id, user_id, timestamp }) {
    // Fast required field checks
    if (!app_id || !message || !level || !source) {
      throw new Error('Missing required fields: app_id, message, level, source');
    }

    // Fast length checks (no regex)
    if (app_id.length > 100 || message.length > 10000 || source.length > 64) {
      throw new Error('Field length exceeded');
    }

    // Fast level check
    if (!LogEntry.VALID_LEVELS.has(level)) {
      throw new Error('Invalid log level');
    }

    // Fast metadata size check (approximate)
    if (JSON.stringify(metadata).length > 16384) {
      throw new Error('Metadata too large');
    }

    // Assign validated values
    this.id = id;
    this.app_id = app_id;
    this.timestamp = timestamp; // Only populated when reading from DB
    this.level = level;
    this.message = message;
    this.source = source;
    this.environment = environment;
    this.metadata = metadata;
    this.trace_id = trace_id;
    this.user_id = user_id;
  }

  // Static factory method for safe creation
  static createSafe(data) {
    try {
      return { success: true, entry: new LogEntry(data) };
    } catch (error) {
      return { success: false, error: error.message, data };
    }
  }

  // Static factory for high-throughput (light validation)
  static createFast(data) {
    return new LogEntry(data, { lightValidation: true });
  }

  // Static factory for maximum performance (skip validation)
  static createUnsafe(data) {
    return new LogEntry(data, { skipValidation: true });
  }

  /**
   * Batch validation - validates an array of log data in a single pass
   * Much faster than validating individually for batches > 100 logs
   * 
   * @param {Array<Object>} logsDataArray - Array of raw log data objects
   * @returns {Object} { validEntries: LogEntry[], errors: Array }
   */
  static validateBatch(logsDataArray) {
    if (!Array.isArray(logsDataArray)) {
      throw new Error('validateBatch expects an array of log data');
    }

    const validEntries = [];
    const errors = [];

    // Single-pass validation - optimized for performance
    for (let i = 0; i < logsDataArray.length; i++) {
      const data = logsDataArray[i];
      
      try {
        // Fast required field checks
        if (!data.app_id || !data.message || !data.level || !data.source) {
          throw new Error('Missing required fields: app_id, message, level, source');
        }

        // Fast type checks
        if (typeof data.app_id !== 'string' || 
            typeof data.message !== 'string' || 
            typeof data.source !== 'string') {
          throw new Error('app_id, message, and source must be strings');
        }

        // Fast length checks (no detailed error messages for performance)
        if (data.app_id.length === 0 || data.app_id.length > 100 ||
            data.message.length === 0 || data.message.length > 10000 ||
            data.source.length === 0 || data.source.length > 64) {
          throw new Error('Field length validation failed');
        }

        // Fast level check
        const levelUpper = typeof data.level === 'string' ? data.level.toUpperCase() : null;
        if (!LogEntry.VALID_LEVELS.has(levelUpper)) {
          throw new Error('Invalid log level');
        }

        // Fast metadata check (if provided)
        const metadata = data.metadata ?? {};
        if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
          throw new Error('metadata must be an object');
        }
        
        // Quick metadata size check (approximate)
        if (JSON.stringify(metadata).length > 16384) {
          throw new Error('Metadata too large');
        }

        // Environment check (if provided)
        const environment = data.environment || 'prod';
        if (typeof environment !== 'string' || environment.length === 0 || environment.length > 32) {
          throw new Error('Invalid environment');
        }

        // Optional field type checks
        if (data.trace_id !== null && data.trace_id !== undefined && typeof data.trace_id !== 'string') {
          throw new Error('trace_id must be a string');
        }
        if (data.user_id !== null && data.user_id !== undefined && typeof data.user_id !== 'string') {
          throw new Error('user_id must be a string');
        }

        // Validation passed - create LogEntry with skipValidation for performance
        validEntries.push(LogEntry.createUnsafe(data));

      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: data
        });
      }
    }

    return { validEntries, errors };
  }

  /**
   * Fast batch validation with even less strict checks
   * For high-throughput scenarios where you trust the data more
   * 
   * @param {Array<Object>} logsDataArray - Array of raw log data objects
   * @returns {Object} { validEntries: LogEntry[], errors: Array }
   */
  static validateBatchFast(logsDataArray) {
    if (!Array.isArray(logsDataArray)) {
      throw new Error('validateBatchFast expects an array of log data');
    }

    const validEntries = [];
    const errors = [];

    // Ultra-fast validation - minimal checks
    for (let i = 0; i < logsDataArray.length; i++) {
      const data = logsDataArray[i];
      
      try {
        // Only check required fields exist and have reasonable lengths
        if (!data.app_id || !data.message || !data.level || !data.source) {
          throw new Error('Missing required fields');
        }

        if (data.app_id.length > 100 || data.message.length > 10000 || data.source.length > 64) {
          throw new Error('Field length exceeded');
        }

        const levelUpper = typeof data.level === 'string' ? data.level.toUpperCase() : null;
        if (!LogEntry.VALID_LEVELS.has(levelUpper)) {
          throw new Error('Invalid log level');
        }

        // Create LogEntry with skipValidation
        validEntries.push(LogEntry.createUnsafe(data));

      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: data
        });
      }
    }

    return { validEntries, errors };
  }

  // Convert to plain object for storage (insertion only - no timestamp)
  toObject() {
    return {
      id: this.id,
      app_id: this.app_id,
      level: this.level,
      message: this.message,
      source: this.source,
      environment: this.environment,
      metadata: JSON.stringify(this.metadata), // ClickHouse expects JSON string
      trace_id: this.trace_id || '', // Convert null to empty string for ClickHouse
      user_id: this.user_id || ''    // Convert null to empty string for ClickHouse
      // timestamp omitted - ClickHouse generates it with DEFAULT now()
    };
  }

  // Clone with optional overrides (preserves timestamp if reading from DB)
  clone(overrides = {}) {
    return new LogEntry({
      id: this.id,
      app_id: this.app_id,
      timestamp: this.timestamp, // Preserved when cloning DB entities
      level: this.level,
      message: this.message,
      source: this.source,
      environment: this.environment,
      metadata: {
        ...this.metadata,
        ...(overrides.metadata || {})
      },
      trace_id: this.trace_id,
      user_id: this.user_id,
      ...overrides
    });
  }
}

module.exports = LogEntry;
