const { randomUUID } = require('crypto');

/**
 * LogEntry Domain Entity
 * Represents a log entry with inline validation
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

  // UUID validation regex (RFC 4122)
  static UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  // ISO 8601 date-time validation regex
  static ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

  constructor(data) {
    // ===== NORMALIZATION =====
    const id = data.id || randomUUID();
    const timestamp = data.timestamp || new Date().toISOString();
    const level = data.level?.toUpperCase();
    const metadata = data.metadata ?? {};
    const environment = data.environment || 'prod';
    const trace_id = data.trace_id ?? null;
    const user_id = data.user_id ?? null;
    const app_id = data.app_id;
    const message = data.message;
    const source = data.source;

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

    // ===== TIMESTAMP VALIDATION =====
    if (typeof timestamp !== 'string') {
      throw new Error('timestamp must be a string');
    }
    if (!LogEntry.ISO_DATETIME_REGEX.test(timestamp)) {
      throw new Error('timestamp must be in ISO 8601 format');
    }
    const timestampDate = new Date(timestamp);
    if (isNaN(timestampDate.getTime())) {
      throw new Error('timestamp must be a valid date');
    }
    // Prevent far-future timestamps (5 min tolerance)
    const fiveMinutesInFuture = Date.now() + (5 * 60 * 1000);
    if (timestampDate.getTime() > fiveMinutesInFuture) {
      throw new Error('timestamp cannot be more than 5 minutes in the future');
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
    this.timestamp = timestamp;
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

  // Convert to plain object for storage
  toObject() {
    return {
      id: this.id,
      app_id: this.app_id,
      timestamp: this.timestamp,
      level: this.level,
      message: this.message,
      source: this.source,
      environment: this.environment,
      metadata: this.metadata,
      trace_id: this.trace_id,
      user_id: this.user_id
    };
  }

  // Clone with optional overrides
  clone(overrides = {}) {
    return new LogEntry({
      ...this.toObject(),
      ...overrides,
      metadata: {
        ...this.metadata,
        ...(overrides.metadata || {})
      }
    });
  }
}

module.exports = LogEntry;
