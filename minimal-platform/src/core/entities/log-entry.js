/**
 * Log Entry Entity (Domain Object)
 * Represents a single log entry with validation
 */

class LogEntry {
  constructor({ timestamp, level, message, service, metadata = {} }) {
    this.validate({ timestamp, level, message, service });
    
    this.timestamp = timestamp || new Date().toISOString();
    this.level = level.toUpperCase();
    this.message = message;
    this.service = service;
    this.metadata = metadata;
  }

  validate({ level, message, service }) {
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    
    if (!validLevels.includes(level?.toUpperCase())) {
      throw new Error(`Invalid log level. Must be one of: ${validLevels.join(', ')}`);
    }
    
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }
    
    if (!service || typeof service !== 'string') {
      throw new Error('Service is required and must be a string');
    }
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      level: this.level,
      message: this.message,
      service: this.service,
      metadata: this.metadata
    };
  }
}

module.exports = LogEntry;

