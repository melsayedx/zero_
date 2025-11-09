-- Create database if not exists
CREATE DATABASE IF NOT EXISTS logs_db;

-- Use the database
USE logs_db;

-- Create logs table with optimized schema for time-series data
CREATE TABLE IF NOT EXISTS logs (
    id String,
    timestamp DateTime64(3),
    level LowCardinality(String),
    message String,
    source LowCardinality(String),
    metadata String,
    trace_id String,
    user_id String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, level, source)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

