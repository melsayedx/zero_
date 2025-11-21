/**
 * Log Entry Object Pool
 * 
 * Provides pooled log entry objects to reduce GC pressure
 * during high-throughput log ingestion
 */

const ObjectPool = require('../utils/object-pool');
const LogEntry = require('./log-entry');

/**
 * Factory function for creating log entry objects
 */
function createLogEntry() {
  return {
    id: null,
    app_id: null,
    message: null,
    level: null,
    source: null,
    environment: null,
    timestamp: null,
    metadata: null,
    trace_id: null,
    user_id: null
  };
}

/**
 * Reset function to clear log entry state
 */
function resetLogEntry(entry) {
  entry.id = null;
  entry.app_id = null;
  entry.message = null;
  entry.level = null;
  entry.source = null;
  entry.environment = null;
  entry.timestamp = null;
  entry.metadata = null;
  entry.trace_id = null;
  entry.user_id = null;
}

/**
 * Create a log entry pool
 * @param {Object} options - Pool configuration
 * @returns {ObjectPool} Configured object pool
 */
function createLogEntryPool(options = {}) {
  return new ObjectPool(createLogEntry, resetLogEntry, {
    initialSize: options.initialSize || 1000,
    maxSize: options.maxSize || 10000,
    ...options
  });
}

/**
 * Populate a pooled log entry with data
 * @param {Object} pooledEntry - Pooled entry object
 * @param {Object} data - Log entry data
 * @returns {LogEntry} Populated log entry
 */
function populateLogEntry(pooledEntry, data) {
  // Copy data to pooled object
  pooledEntry.id = data.id || null;
  pooledEntry.app_id = data.app_id;
  pooledEntry.message = data.message;
  pooledEntry.level = data.level || 'INFO';
  pooledEntry.source = data.source;
  pooledEntry.environment = data.environment || null;
  pooledEntry.timestamp = data.timestamp || new Date();
  pooledEntry.metadata = data.metadata || null;
  pooledEntry.trace_id = data.trace_id || null;
  pooledEntry.user_id = data.user_id || null;
  
  // Create LogEntry instance with pooled data
  return new LogEntry(pooledEntry);
}

/**
 * Batch populate multiple log entries efficiently
 * @param {ObjectPool} pool - Log entry pool
 * @param {Array<Object>} dataArray - Array of log entry data
 * @returns {Array<LogEntry>} Array of populated log entries
 */
function batchPopulateLogEntries(pool, dataArray) {
  const entries = new Array(dataArray.length);
  
  for (let i = 0; i < dataArray.length; i++) {
    const pooledEntry = pool.acquire();
    entries[i] = populateLogEntry(pooledEntry, dataArray[i]);
  }
  
  return entries;
}

/**
 * Release log entries back to pool
 * Note: This should be called after entries are no longer needed
 * @param {ObjectPool} pool - Log entry pool
 * @param {Array<Object>} entries - Entries to release
 */
function releaseLogEntries(pool, entries) {
  if (!Array.isArray(entries)) return;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Extract the raw data object (not the LogEntry wrapper)
    const rawData = {
      id: entry.id,
      app_id: entry.app_id,
      message: entry.message,
      level: entry.level,
      source: entry.source,
      environment: entry.environment,
      timestamp: entry.timestamp,
      metadata: entry.metadata,
      trace_id: entry.trace_id,
      user_id: entry.user_id
    };

    pool.release(rawData);
  }
}

module.exports = {
  createLogEntryPool,
  populateLogEntry,
  batchPopulateLogEntries,
  releaseLogEntries
};

