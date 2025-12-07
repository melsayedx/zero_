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
const LogEntry = require('../../domain/entities/log-entry');
const LogLevel = require('../../domain/value-objects/log-level');
const protobuf = require('protobufjs');
const path = require('path');



/**
 * Handler function to get health check result
 */
function getHealthCheckResult() {
  return {
    healthy: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    protobufInitialized: protobufRoot !== null
  };
}

// Shutdown message type (handled separately as it terminates process)
const SHUTDOWN_MESSAGE = 'shutdown';

/**
 * Message type to handler function map
 */
const MESSAGE_HANDLERS = {
  'validate_batch': (data) => validateBatch(data.logsDataArray),
  'parse_json': (data) => parseJson(data.jsonString),
  'decode_protobuf': (data) => decodeProtobuf(data.buffer),
  'decode_protobuf_batch': (data) => decodeProtobufBatch(data.buffer),
  'transform_data': (data) => transformData(data.rows),
  'health_check': () => getHealthCheckResult()
};

// Protobuf parser state
let protobufRoot = null;
let LogEntryProto = null;
let LogEntryBatchProto = null;

/**
 * Send response back to main thread
 */
function sendResponse(requestId, type, data = null, error = null) {
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
async function validateBatch(logsDataArray) {
  try {
    const length = logsDataArray.length;
    // Pre-allocate array with max possible size to avoid reallocation
    const validEntries = new Array(length);
    const errors = [];
    let validCount = 0;

    for (let i = 0; i < length; i++) {
      const data = logsDataArray[i];
      try {
        // normalize() now returns primitives directly
        validEntries[validCount++] = LogEntry.normalize(data);
      } catch (error) {
        errors.push({ data, error: error.message });
      }
    }

    // Trim array to actual size if some entries failed validation
    validEntries.length = validCount;

    return { validEntries, errors };
  } catch (error) {
    throw new Error(`Batch validation failed: ${error.message}`);
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
    const protoPath = path.join(__dirname, '../../../proto/logs/log-entry.proto');
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
  return LogLevel.fromValue(level).value;
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
    // Handle shutdown separately as it terminates the process
    if (type === SHUTDOWN_MESSAGE) {
      process.exit(0);
      return;
    }

    const handler = MESSAGE_HANDLERS[type];
    if (!handler) {
      throw new Error(`Unknown message type: ${type}`);
    }

    const result = await handler(data);
    sendResponse(requestId, type, result);

  } catch (error) {
    sendResponse(requestId, type, error);
  }
});

// Signal ready to main thread
parentPort.postMessage({
  type: 'ready',
  timestamp: Date.now()
});
