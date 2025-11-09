/**
 * ClickHouse Logs Schema
 * Defines the structure and queries for logs storage in ClickHouse
 */

/**
 * Main logs table creation SQL
 * Optimized for time-series log data with high write throughput
 */
const CREATE_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS logs (
    timestamp DateTime64(9),
    level LowCardinality(String),
    message String,
    service LowCardinality(String),
    metadata Map(String, String),
    host LowCardinality(String),
    environment LowCardinality(String),
    trace_id String,
    span_id String,
    event_date Date DEFAULT toDate(timestamp)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, service, level)
SETTINGS 
    index_granularity = 8192,
    ttl_only_drop_parts = 1;
`;

/**
 * Distributed table for cluster setup (optional)
 */
const CREATE_DISTRIBUTED_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS logs_distributed AS logs
ENGINE = Distributed(logs_cluster, default, logs, rand());
`;

/**
 * Materialized view for log level aggregations
 * Pre-aggregates logs by service, level, and hour
 */
const CREATE_LOGS_BY_LEVEL_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS logs_by_level_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, service, level)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    service,
    level,
    count() AS log_count
FROM logs
GROUP BY hour, service, level;
`;

/**
 * Materialized view for error tracking
 * Stores error logs separately for faster error analysis
 */
const CREATE_ERROR_LOGS_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS error_logs_mv
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, service)
AS SELECT
    timestamp,
    service,
    message,
    host,
    environment,
    metadata
FROM logs
WHERE level IN ('ERROR', 'FATAL');
`;

/**
 * Materialized view for service metrics
 * Aggregates logs per service per minute
 */
const CREATE_SERVICE_METRICS_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS service_metrics_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (minute, service)
AS SELECT
    toStartOfMinute(timestamp) AS minute,
    service,
    level,
    count() AS log_count,
    countIf(level = 'ERROR') AS error_count,
    countIf(level = 'WARN') AS warn_count
FROM logs
GROUP BY minute, service, level;
`;

/**
 * TTL policy for log retention (optional - 90 days)
 */
const ALTER_LOGS_TTL = `
ALTER TABLE logs
MODIFY TTL timestamp + INTERVAL 90 DAY;
`;

/**
 * Index for faster text search on messages
 */
const CREATE_MESSAGE_INDEX = `
ALTER TABLE logs
ADD INDEX IF NOT EXISTS message_idx message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4;
`;

/**
 * Index for trace_id lookup
 */
const CREATE_TRACE_INDEX = `
ALTER TABLE logs
ADD INDEX IF NOT EXISTS trace_idx trace_id TYPE bloom_filter() GRANULARITY 4;
`;

/**
 * Common query templates
 */
const queries = {
  /**
   * Insert single log entry
   */
  insertLog: `
    INSERT INTO logs (timestamp, level, message, service, metadata, host, environment, trace_id, span_id)
    VALUES ({timestamp: DateTime64(9)}, {level: String}, {message: String}, {service: String}, 
            {metadata: Map(String, String)}, {host: String}, {environment: String}, 
            {trace_id: String}, {span_id: String})
  `,

  /**
   * Insert batch of logs (high performance)
   */
  insertBatch: `INSERT INTO logs FORMAT JSONEachRow`,

  /**
   * Query logs with filters
   */
  queryLogs: `
    SELECT 
      timestamp,
      level,
      message,
      service,
      metadata,
      host,
      environment,
      trace_id,
      span_id
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      {serviceFilter}
      {levelFilter}
      {searchFilter}
      {hostFilter}
      {environmentFilter}
    ORDER BY timestamp DESC
    LIMIT {limit: UInt32}
    OFFSET {offset: UInt32}
  `,

  /**
   * Count logs with filters
   */
  countLogs: `
    SELECT count() as total
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      {filters}
  `,

  /**
   * Get log level distribution
   */
  logsByLevel: `
    SELECT 
      level,
      count() as count
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      {filters}
    GROUP BY level
    ORDER BY count DESC
  `,

  /**
   * Get logs by service
   */
  logsByService: `
    SELECT 
      service,
      count() as count,
      countIf(level = 'ERROR') as errors,
      countIf(level = 'WARN') as warnings
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
    GROUP BY service
    ORDER BY count DESC
  `,

  /**
   * Get logs over time (time series)
   */
  logsTimeSeries: `
    SELECT 
      toStartOfInterval(timestamp, INTERVAL {interval: String}) as time,
      count() as count
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      {filters}
    GROUP BY time
    ORDER BY time
  `,

  /**
   * Get error rate over time
   */
  errorRate: `
    SELECT 
      toStartOfMinute(timestamp) as time,
      countIf(level IN ('ERROR', 'FATAL')) as errors,
      count() as total,
      (errors / total) * 100 as error_rate
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      {filters}
    GROUP BY time
    ORDER BY time
  `,

  /**
   * Full-text search on messages
   */
  searchLogs: `
    SELECT 
      timestamp,
      level,
      message,
      service,
      host
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
      AND positionCaseInsensitive(message, {searchTerm: String}) > 0
      {filters}
    ORDER BY timestamp DESC
    LIMIT {limit: UInt32}
  `,

  /**
   * Get logs by trace ID
   */
  logsByTraceId: `
    SELECT 
      timestamp,
      level,
      message,
      service,
      span_id,
      metadata
    FROM logs
    WHERE trace_id = {traceId: String}
    ORDER BY timestamp ASC
  `,

  /**
   * Get top error messages
   */
  topErrors: `
    SELECT 
      message,
      service,
      count() as occurrences,
      max(timestamp) as last_seen
    FROM logs
    WHERE level IN ('ERROR', 'FATAL')
      AND timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
    GROUP BY message, service
    ORDER BY occurrences DESC
    LIMIT {limit: UInt32}
  `,

  /**
   * Get system health metrics
   */
  systemMetrics: `
    SELECT 
      toStartOfMinute(timestamp) as time,
      service,
      count() as total_logs,
      countIf(level = 'ERROR') as errors,
      countIf(level = 'WARN') as warnings,
      avg(length(message)) as avg_message_length
    FROM logs
    WHERE timestamp BETWEEN {startTime: DateTime64(9)} AND {endTime: DateTime64(9)}
    GROUP BY time, service
    ORDER BY time DESC
  `
};

/**
 * Helper function to build filter clauses
 * @param {Object} filters - Filter parameters
 * @returns {string} SQL filter clause
 */
const buildFilterClause = (filters = {}) => {
  const clauses = [];
  
  if (filters.service) {
    clauses.push(`AND service = '${filters.service}'`);
  }
  
  if (filters.level) {
    clauses.push(`AND level = '${filters.level}'`);
  }
  
  if (filters.host) {
    clauses.push(`AND host = '${filters.host}'`);
  }
  
  if (filters.environment) {
    clauses.push(`AND environment = '${filters.environment}'`);
  }
  
  if (filters.search) {
    clauses.push(`AND positionCaseInsensitive(message, '${filters.search}') > 0`);
  }
  
  return clauses.join(' ');
};

/**
 * Schema setup function
 * Executes all table and view creation statements
 */
const setupSchema = async (client) => {
  const statements = [
    CREATE_LOGS_TABLE,
    CREATE_LOGS_BY_LEVEL_MV,
    CREATE_ERROR_LOGS_MV,
    CREATE_SERVICE_METRICS_MV
  ];
  
  for (const statement of statements) {
    await client.command({ query: statement });
  }
  
  // Optional: Add indexes (comment out if not needed)
  // await client.command({ query: CREATE_MESSAGE_INDEX });
  // await client.command({ query: CREATE_TRACE_INDEX });
  
  console.log('ClickHouse schema setup completed');
};

module.exports = {
  CREATE_LOGS_TABLE,
  CREATE_DISTRIBUTED_LOGS_TABLE,
  CREATE_LOGS_BY_LEVEL_MV,
  CREATE_ERROR_LOGS_MV,
  CREATE_SERVICE_METRICS_MV,
  ALTER_LOGS_TTL,
  CREATE_MESSAGE_INDEX,
  CREATE_TRACE_INDEX,
  queries,
  buildFilterClause,
  setupSchema
};

