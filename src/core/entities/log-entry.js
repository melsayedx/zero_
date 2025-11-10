const { randomUUID } = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

/**
 * LogEntry Domain Entity
 * Represents a log entry with validation
 */
class LogEntry {
  // Static Ajv instance shared across all LogEntry instances
  static ajv = new Ajv({ 
    allErrors: true,      // Collect all validation errors
    coerceTypes: true,    // Auto-convert string timestamps to correct type
    removeAdditional: false, // Keep extra properties
    useDefaults: true     // Apply default values from schema
  });

  // Add format validators (date-time, uuid, etc.)
  static {
    addFormats(LogEntry.ajv);
  }

  // Define JSON Schema for log entry validation
  static schema = {
    type: 'object',
    properties: {
      id: { 
        type: 'string',
        format: 'uuid'
      },
      app_id: { 
        type: 'string',
        minLength: 1
      },
      timestamp: { type: 'string', format: 'date-time' },
      level: { 
        type: 'string',
        enum: ['debug', 'info', 'warn', 'error', 'fatal'],
        transform: ['toUpperCase']
      },
      message: { 
        type: 'string',
        minLength: 1
      },
      source: { 
        type: 'string',
        minLength: 1
      },
      metadata: { 
        type: 'object',
        default: {}
      },
      trace_id: { 
        type: ['string', 'null'],
        default: null
      },
      user_id: { 
        type: ['string', 'null'],
        default: null
      }
    },
    required: ['app_id', 'message', 'level', 'source'],
    additionalProperties: false
  };

  // Compile schema once for performance
  static validate = LogEntry.ajv.compile(LogEntry.schema);

  constructor(data) {
    // Normalize level to lowercase before validation
    const normalizedData = {
      ...data,
      id: data.id || uuidv4(),
      timestamp: data.timestamp || new Date().toISOString(),
      level: data.level ? data.level.toLowerCase() : undefined,
      metadata: data.metadata || {}
    };

    // Validate with Ajv
    const valid = LogEntry.validate(normalizedData);
    
    if (!valid) {
      const errors = LogEntry.validate.errors
        .map(err => {
          // Format error messages for better readability
          const field = err.instancePath.substring(1) || err.params.missingProperty;
          return `${field}: ${err.message}`;
        })
        .join('; ');
      
      throw new Error(`LogEntry validation failed: ${errors}`);
    }

    // Assign validated properties
    this.id = normalizedData.id;
    this.app_id = normalizedData.app_id;
    this.timestamp = new Date(normalizedData.timestamp);
    this.level = normalizedData.level;
    this.message = normalizedData.message;
    this.source = normalizedData.source;
    this.metadata = normalizedData.metadata;
    this.trace_id = normalizedData.trace_id;
    this.user_id = normalizedData.user_id;
  }

  /**
   * Convert to plain object for storage
   */
  toObject() {
    return {
      id: this.id,
      app_id: this.app_id,
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
