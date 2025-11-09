const { randomUUID } = require('crypto');

/**
 * LogEntry Domain Entity
 * Represents a log entry with validation
 */
class LogEntry {
  constructor({ id, timestamp, level, message, source, metadata = {}, trace_id = null, user_id = null }) {
    // Validate required fields
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }

    if (!level || typeof level !== 'string') {
      throw new Error('Level is required and must be a string');
    }

    const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
    if (!validLevels.includes(level.toLowerCase())) {
      throw new Error(`Level must be one of: ${validLevels.join(', ')}`);
    }

    if (!source || typeof source !== 'string') {
      throw new Error('Source is required and must be a string');
    }

    // Assign properties
    this.id = id || randomUUID();
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
    this.level = level.toLowerCase();
    this.message = message;
    this.source = source;
    this.metadata = metadata || {};
    this.trace_id = trace_id;
    this.user_id = user_id;

    // Validate timestamp
    if (isNaN(this.timestamp.getTime())) {
      throw new Error('Invalid timestamp provided');
    }

    // Validate metadata is an object
    if (typeof this.metadata !== 'object' || Array.isArray(this.metadata)) {
      throw new Error('Metadata must be an object');
    }
  }

  /**
   * Convert to plain object for storage
   */
  toObject() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      level: this.level,
      message: this.message,
      source: this.source,
      metadata: this.metadata,
      trace_id: this.trace_id,
      user_id: this.user_id
    };
  }
}

module.exports = LogEntry;

