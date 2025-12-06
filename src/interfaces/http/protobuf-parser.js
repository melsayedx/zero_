/**
 * Protocol Buffer Parser for Log Entries
 * Handles decoding of protobuf messages to JavaScript objects
 * Now with zero-copy optimizations for better performance
 */

const protobuf = require('protobufjs');
const path = require('path');
const { decodeProtobufZeroCopy, createBufferView } = require('../../infrastructure/buffers/buffer-utils');

// Log level mapping from protobuf enum to string
const LOG_LEVEL_MAP = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
  4: 'FATAL'
};

/**
 * ProtobufParser class for handling protobuf log entries
 */
class ProtobufParser {
  constructor() {
    this.root = null;
    this.LogEntry = null;
    this.LogEntryBatch = null;
    this.initialized = false;
  }

  /**
   * Initialize the protobuf parser by loading the .proto file
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const protoPath = path.join(__dirname, '../../../proto/logs/log-entry.proto');
      this.root = await protobuf.load(protoPath);
      
      // Get message types
      this.LogEntry = this.root.lookupType('logs.LogEntry');
      this.LogEntryBatch = this.root.lookupType('logs.LogEntryBatch');
      
      this.initialized = true;
      console.log('[ProtobufParser] Successfully loaded protobuf definitions');
    } catch (error) {
      console.error('[ProtobufParser] Failed to load protobuf definitions:', error);
      throw new Error(`Failed to initialize protobuf parser: ${error.message}`);
    }
  }

  /**
   * Decode a single log entry from protobuf binary format
   * Uses zero-copy buffer views for better performance
   * @param {Buffer} buffer - Binary protobuf data
   * @returns {Object} Decoded log entry as plain JavaScript object
   */
  decodeSingleEntry(buffer) {
    if (!this.initialized) {
      throw new Error('ProtobufParser not initialized. Call initialize() first.');
    }

    try {
      // Use zero-copy buffer view instead of copying
      const view = createBufferView(buffer);
      const message = this.LogEntry.decode(view);
      const object = this.LogEntry.toObject(message, {
        enums: String,  // Convert enums to strings
        longs: Number,  // Convert longs to numbers
        defaults: false, // Don't include default values
        arrays: true,   // Always initialize arrays
        objects: true   // Always initialize objects
      });

      // Transform protobuf object to match our LogEntry domain model
      return this._transformToLogEntry(object);
    } catch (error) {
      throw new Error(`Failed to decode protobuf log entry: ${error.message}`);
    }
  }

  /**
   * Decode a batch of log entries from protobuf binary format
   * Uses zero-copy buffer views for better performance
   * @param {Buffer} buffer - Binary protobuf data
   * @returns {Array<Object>} Array of decoded log entries
   */
  decodeBatch(buffer) {
    if (!this.initialized) {
      throw new Error('ProtobufParser not initialized. Call initialize() first.');
    }

    try {
      // Use zero-copy buffer view instead of copying
      const view = createBufferView(buffer);
      const message = this.LogEntryBatch.decode(view);
      const object = this.LogEntryBatch.toObject(message, {
        enums: String,
        longs: Number,
        defaults: false,
        arrays: true,
        objects: true
      });

      // Transform each entry in the batch
      return (object.entries || []).map(entry => this._transformToLogEntry(entry));
    } catch (error) {
      throw new Error(`Failed to decode protobuf log entry batch: ${error.message}`);
    }
  }

  /**
   * Transform protobuf object to LogEntry domain model format
   * @private
   * @param {Object} protoObject - Decoded protobuf object
   * @returns {Object} Transformed log entry
   */
  _transformToLogEntry(protoObject) {
    const entry = {
      app_id: protoObject.appId || protoObject.app_id,
      message: protoObject.message,
      source: protoObject.source,
      level: this._mapLogLevel(protoObject.level),
    };

    // Optional fields - only include if provided
    if (protoObject.id) {
      entry.id = protoObject.id;
    }

    if (protoObject.environment) {
      entry.environment = protoObject.environment;
    }

    // Convert metadata map to plain object
    if (protoObject.metadata && Object.keys(protoObject.metadata).length > 0) {
      entry.metadata = protoObject.metadata;
    }

    if (protoObject.traceId || protoObject.trace_id) {
      entry.trace_id = protoObject.traceId || protoObject.trace_id;
    }

    if (protoObject.userId || protoObject.user_id) {
      entry.user_id = protoObject.userId || protoObject.user_id;
    }

    // Timestamp handling - convert from milliseconds if provided
    if (protoObject.timestamp && protoObject.timestamp !== 0) {
      entry.timestamp = new Date(Number(protoObject.timestamp));
    }

    return entry;
  }

  /**
   * Map protobuf log level (number or string) to our log level string
   * @private
   * @param {number|string} level - Protobuf log level
   * @returns {string} Log level string
   */
  _mapLogLevel(level) {
    if (typeof level === 'string') {
      return level.toUpperCase();
    }
    return LOG_LEVEL_MAP[level] || 'INFO';
  }

  /**
   * Verify a protobuf message before decoding (optional validation)
   * @param {Buffer} buffer - Binary protobuf data
   * @param {boolean} isBatch - Whether this is a batch message
   * @returns {string|null} Error message if invalid, null if valid
   */
  verify(buffer, isBatch = false) {
    if (!this.initialized) {
      return 'ProtobufParser not initialized';
    }

    try {
      const MessageType = isBatch ? this.LogEntryBatch : this.LogEntry;
      const message = MessageType.decode(buffer);
      const error = MessageType.verify(message);
      return error;
    } catch (error) {
      return error.message;
    }
  }
}

// Singleton instance
let parserInstance = null;

/**
 * Get the singleton ProtobufParser instance
 * @returns {Promise<ProtobufParser>}
 */
async function getProtobufParser() {
  if (!parserInstance) {
    parserInstance = new ProtobufParser();
    await parserInstance.initialize();
  }
  return parserInstance;
}

module.exports = {
  ProtobufParser,
  getProtobufParser
};

