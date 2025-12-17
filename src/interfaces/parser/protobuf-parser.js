/**
 * Protocol Buffer Parser for Log Entries
 * Handles decoding of protobuf messages to JavaScript objects
 * 
 * Supports two loading modes:
 * - Dynamic: Loads .proto file at runtime (default, easier dev workflow)
 * - Static: Uses pre-generated JS files (faster startup, better for production)
 * 
 * Toggle via: PROTOBUF_LOAD_MODE=static|dynamic (default: dynamic)
 */

const path = require('path');
const LogLevel = require('../../domain/value-objects/log-level');
const LoggerFactory = require('../../infrastructure/logging/logger-factory');
const logger = LoggerFactory.named('ProtobufParser');

/**
 * ProtobufParser class for handling protobuf log entries
 * Implements singleton pattern via getInstance()
 */
class ProtobufParser {
  // Private constructor symbol
  static #privateConstructor = Symbol('ProtobufParser.privateConstructor');

  // Singleton instance
  static #instance = null;

  // Default load mode from environment
  static #DEFAULT_LOAD_MODE = process.env.PROTOBUF_LOAD_MODE || 'dynamic';

  /**
   * Private constructor - use ProtobufParser.getInstance() instead
   * @throws {Error} When called without private symbol
   */
  constructor(secret) {
    if (secret !== ProtobufParser.#privateConstructor) {
      throw new Error(
        'ProtobufParser cannot be instantiated directly. Use ProtobufParser.getInstance() instead'
      );
    }

    this.loadMode = ProtobufParser.#DEFAULT_LOAD_MODE;
    this.LogEntry = null;
    this.LogEntryBatch = null;
    this.initialized = false;
    this.root = null; // For dynamic mode only
  }

  /**
   * Get singleton instance of ProtobufParser
   * @returns {Promise<ProtobufParser>}
   */
  static async getInstance() {
    if (!ProtobufParser.#instance) {
      ProtobufParser.#instance = new ProtobufParser(ProtobufParser.#privateConstructor);
      await ProtobufParser.#instance.initialize();
    }
    return ProtobufParser.#instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance() {
    ProtobufParser.#instance = null;
  }

  /**
   * Initialize the protobuf parser
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      if (this.loadMode === 'static') {
        await this._initializeStatic();
      } else {
        await this._initializeDynamic();
      }

      this.initialized = true;
      logger.info(`ProtobufParser initialized in ${this.loadMode} mode`);
    } catch (error) {
      logger.error('ProtobufParser failed to initialize', { error });
      throw new Error(`Failed to initialize protobuf parser: ${error.message}`);
    }
  }

  /**
   * Initialize using dynamic loading (protobufjs)
   * @private
   */
  async _initializeDynamic() {
    const protobuf = require('protobufjs');
    const protoPath = path.join(__dirname, '../../../proto/logs/log-entry.proto');

    this.root = await protobuf.load(protoPath);
    this.LogEntry = this.root.lookupType('logs.LogEntry');
    this.LogEntryBatch = this.root.lookupType('logs.LogEntryBatch');
  }

  /**
   * Initialize using static pre-generated files (google-protobuf)
   * @private
   */
  async _initializeStatic() {
    const { LogEntry, LogEntryBatch } = require('../../infrastructure/grpc/generated/proto/logs/log-entry_pb');

    // Wrap static classes to match dynamic API
    this.LogEntry = {
      decode: (buffer) => LogEntry.deserializeBinary(buffer),
      toObject: (message) => message.toObject()
    };

    this.LogEntryBatch = {
      decode: (buffer) => LogEntryBatch.deserializeBinary(buffer),
      toObject: (message) => {
        const obj = message.toObject();
        obj.entries = obj.entriesList; // Normalize field name
        return obj;
      }
    };
  }

  /**
   * Decode a single log entry from protobuf binary format
   * @param {Buffer} buffer - Binary protobuf data
   * @returns {Object} Decoded log entry as plain JavaScript object
   */
  decodeSingleEntry(buffer) {
    const object = this._decode(buffer, this.LogEntry, 'log entry');
    return this._transformToLogEntry(object);
  }

  /**
   * Decode a batch of log entries from protobuf binary format
   * @param {Buffer} buffer - Binary protobuf data
   * @returns {Array<Object>} Array of decoded log entries
   */
  decodeBatch(buffer) {
    const object = this._decode(buffer, this.LogEntryBatch, 'log entry batch');
    return (object.entries || []).map(entry => this._transformToLogEntry(entry));
  }

  /**
   * Common decode logic for both single and batch entries
   * @private
   */
  _decode(buffer, messageType, errorLabel) {
    if (!this.initialized) {
      throw new Error('ProtobufParser not initialized. Call getInstance() first.');
    }

    try {
      const view = this._createBufferView(buffer);
      const message = messageType.decode(view);

      return this.loadMode === 'static'
        ? messageType.toObject(message)
        : messageType.toObject(message, {
          enums: String,
          longs: Number,
          defaults: false,
          arrays: true,
          objects: true
        });
    } catch (error) {
      throw new Error(`Failed to decode protobuf ${errorLabel}: ${error.message}`);
    }
  }

  /**
   * Create a zero-copy view of a buffer
   * @private
   */
  _createBufferView(buffer, offset = 0, length = null) {
    const len = length || (buffer.length - offset);
    return new Uint8Array(buffer.buffer, buffer.byteOffset + offset, len);
  }

  /**
   * Transform protobuf object to LogEntry domain model format
   * @private
   */
  _transformToLogEntry(protoObject) {
    const entry = {
      app_id: protoObject.appId || protoObject.app_id,
      message: protoObject.message,
      source: protoObject.source,
      level: LogLevel.fromValue(protoObject.level).value,
    };

    if (protoObject.id) entry.id = protoObject.id;
    if (protoObject.environment) entry.environment = protoObject.environment;

    const metadata = protoObject.metadata || protoObject.metadataMap;
    if (metadata && Object.keys(metadata).length > 0) entry.metadata = metadata;

    if (protoObject.traceId || protoObject.trace_id) {
      entry.trace_id = protoObject.traceId || protoObject.trace_id;
    }
    if (protoObject.userId || protoObject.user_id) {
      entry.user_id = protoObject.userId || protoObject.user_id;
    }
    if (protoObject.timestamp && protoObject.timestamp !== 0) {
      entry.timestamp = new Date(Number(protoObject.timestamp));
    }

    return entry;
  }

  /**
   * Verify a protobuf message before decoding
   * @param {Buffer} buffer - Binary protobuf data
   * @param {boolean} isBatch - Whether this is a batch message
   * @returns {string|null} Error message if invalid, null if valid
   */
  verify(buffer, isBatch = false) {
    if (!this.initialized) return 'ProtobufParser not initialized';

    try {
      const messageType = isBatch ? this.LogEntryBatch : this.LogEntry;
      const message = messageType.decode(buffer);

      // Static mode doesn't have verify, dynamic does
      if (this.loadMode === 'dynamic' && messageType.verify) {
        return messageType.verify(message);
      }
      return null;
    } catch (error) {
      return error.message;
    }
  }

  /**
   * Get the current load mode
   * @returns {string} 'dynamic' or 'static'
   */
  getLoadMode() {
    return this.loadMode;
  }
}

module.exports = ProtobufParser;
