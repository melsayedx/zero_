-- ClickHouse Database Setup Script
-- Initialize database and tables for log ingestion platform

-- Create database
CREATE DATABASE IF NOT EXISTS logs_db;

USE logs_db;

-- Main logs table with optimized schema
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

-- Materialized view for log level aggregations
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

-- Materialized view for error tracking
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

-- Materialized view for service metrics
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

-- Optional: Set TTL for automatic data retention (90 days)
-- ALTER TABLE logs MODIFY TTL timestamp + INTERVAL 90 DAY;

-- Optional: Add indexes for faster queries
-- ALTER TABLE logs ADD INDEX IF NOT EXISTS message_idx message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4;
-- ALTER TABLE logs ADD INDEX IF NOT EXISTS trace_idx trace_id TYPE bloom_filter() GRANULARITY 4;

-- Verify tables created
SHOW TABLES;

