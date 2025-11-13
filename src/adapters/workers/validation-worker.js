/**
 * Validation Worker Thread
 *
 * Offloads CPU-intensive validation operations to worker threads
 * to prevent blocking the main event loop during high-throughput scenarios.
 *
 * Handles:
 * - Batch log entry validation
 * - JSON parsing and validation
 * - Protocol Buffer decoding
 * - Field constraint checking
 * - Data transformation
 */

const { parentPort } = require('worker_threads');
const LogEntry = require('../../core/entities/log-entry');
const protobuf = require('protobufjs');
const path = require('path');

// Worker message types
const MESSAGE_TYPES = {
  VALIDATE_BATCH: 'validate_batch',
  VALIDATE_BATCH_FAST: 'validate_batch_fast',
  PARSE_JSON: 'parse_json',
  DECODE_PROTOBUF: 'decode_protobuf',
  DECODE_PROTOBUF_BATCH: 'decode_protobuf_batch',
  TRANSFORM_DATA: 'transform_data',
  HEALTH_CHECK: 'health_check',
  SHUTDOWN: 'shutdown'
};

// Protobuf parser state
let protobufRoot = null;
let LogEntryProto = null;
let LogEntryBatchProto = null;

// Log level mapping
const LOG_LEVEL_MAP = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
  4: 'FATAL'
};

/**
 * Send response back to main thread
 */
function sendResponse(requestId, type, data, error = null) {
  parentPort.postMessage({
    requestId,
    type,
    data,
    error: error ? { message: error.message, stack: error.stack } : null,
    timestamp: Date.now()
  });
}

/**
 * Validate batch of log entries (full validation)
 */
function validateBatch(logsDataArray) {
  try {
    const result = LogEntry.validateBatch(logsDataArray);

    // Convert LogEntry objects to plain objects for serialization
    result.validEntries = result.validEntries.map(entry => ({
      id: entry.id,
      app_id: entry.app_id,
      level: entry.level,
      message: entry.message,
      source: entry.source,
      environment: entry.environment,
      metadata: entry.metadata,
      trace_id: entry.trace_id,
      user_id: entry.user_id
    }));

    return result;
  } catch (error) {
    throw new Error(`Batch validation failed: ${error.message}`);
  }
}

/**
 * Validate batch of log entries (fast validation)
 */
function validateBatchFast(logsDataArray) {
  try {
    const result = LogEntry.validateBatchFast(logsDataArray);

    // Convert LogEntry objects to plain objects for serialization
    result.validEntries = result.validEntries.map(entry => ({
      id: entry.id,
      app_id: entry.app_id,
      level: entry.level,
      message: entry.message,
      source: entry.source,
      environment: entry.environment,
      metadata: entry.metadata,
      trace_id: entry.trace_id,
      user_id: entry.user_id
    }));

    return result;
  } catch (error) {
    throw new Error(`Fast batch validation failed: ${error.message}`);
  }
}

/**
 * Parse and validate JSON data
 */
function parseJson(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    // Basic validation that it's an array or object
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('JSON must be an object or array');
    }

    return parsed;
  } catch (error) {
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

/**
 * Initialize protobuf parser in worker thread
 */
async function initializeProtobuf() {
  if (protobufRoot) {
    return; // Already initialized
  }

  try {
    const protoPath = path.join(__dirname, '../../../proto/log-entry.proto');
    protobufRoot = await protobuf.load(protoPath);
    LogEntryProto = protobufRoot.lookupType('logs.LogEntry');
    LogEntryBatchProto = protobufRoot.lookupType('logs.LogEntryBatch');
  } catch (error) {
    throw new Error(`Failed to initialize protobuf in worker: ${error.message}`);
  }
}

/**
 * Transform protobuf object to LogEntry format
 */
function transformProtoToLogEntry(protoObject) {
  const entry = {
    app_id: protoObject.appId || protoObject.app_id,
    message: protoObject.message,
    source: protoObject.source,
    level: mapLogLevel(protoObject.level),
  };

  if (protoObject.id) {
    entry.id = protoObject.id;
  }

  if (protoObject.environment) {
    entry.environment = protoObject.environment;
  }

  if (protoObject.metadata && Object.keys(protoObject.metadata).length > 0) {
    entry.metadata = protoObject.metadata;
  }

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
 * Map protobuf log level to string
 */
function mapLogLevel(level) {
  if (typeof level === 'string') {
    return level.toUpperCase();
  }
  return LOG_LEVEL_MAP[level] || 'INFO';
}

/**
 * Decode single protobuf log entry
 */
async function decodeProtobuf(buffer) {
  await initializeProtobuf();

  try {
    const message = LogEntryProto.decode(Buffer.from(buffer));
    const object = LogEntryProto.toObject(message, {
      enums: String,
      longs: Number,
      defaults: false,
      arrays: true,
      objects: true
    });

    return transformProtoToLogEntry(object);
  } catch (error) {
    throw new Error(`Protobuf decode failed: ${error.message}`);
  }
}

/**
 * Decode batch of protobuf log entries
 */
async function decodeProtobufBatch(buffer) {
  await initializeProtobuf();

  try {
    const message = LogEntryBatchProto.decode(Buffer.from(buffer));
    const object = LogEntryBatchProto.toObject(message, {
      enums: String,
      longs: Number,
      defaults: false,
      arrays: true,
      objects: true
    });

    return (object.entries || []).map(entry => transformProtoToLogEntry(entry));
  } catch (error) {
    throw new Error(`Protobuf batch decode failed: ${error.message}`);
  }
}

/**
 * Transform ClickHouse result rows
 * Handles JSON parsing of metadata field and date conversions
 */
function transformData(rows) {
  try {
    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      timestamp: row.timestamp ? new Date(row.timestamp) : null
    }));
  } catch (error) {
    throw new Error(`Data transformation failed: ${error.message}`);
  }
}

// Handle messages from main thread
parentPort.on('message', async (message) => {
  const { requestId, type, data } = message;

  try {
    let result;

    switch (type) {
      case MESSAGE_TYPES.VALIDATE_BATCH:
        result = validateBatch(data.logsDataArray);
        break;

      case MESSAGE_TYPES.VALIDATE_BATCH_FAST:
        result = validateBatchFast(data.logsDataArray);
        break;

      case MESSAGE_TYPES.PARSE_JSON:
        result = parseJson(data.jsonString);
        break;

      case MESSAGE_TYPES.DECODE_PROTOBUF:
        result = await decodeProtobuf(data.buffer);
        break;

      case MESSAGE_TYPES.DECODE_PROTOBUF_BATCH:
        result = await decodeProtobufBatch(data.buffer);
        break;

      case MESSAGE_TYPES.TRANSFORM_DATA:
        result = transformData(data.rows);
        break;

      case MESSAGE_TYPES.HEALTH_CHECK:
        result = {
          healthy: true,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          protobufInitialized: protobufRoot !== null
        };
        break;

      case MESSAGE_TYPES.SHUTDOWN:
        // Graceful shutdown
        process.exit(0);
        return;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    sendResponse(requestId, type, result);

  } catch (error) {
    sendResponse(requestId, type, null, error);
  }
});

// Signal ready to main thread
parentPort.postMessage({
  type: 'ready',
  timestamp: Date.now()
});
