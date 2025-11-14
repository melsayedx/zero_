-- ============================================
-- LOG INGESTION PLATFORM - CLICKHOUSE SCHEMA
-- ============================================
-- 
-- This schema supports MongoDB-based authentication and app-level data isolation.
-- 
-- MONGODB INTEGRATION:
-- - app_id: Maps to MongoDB apps.app_id (globally unique, generated with nanoid)
-- - user_id: Optional field for logging context (not used for primary filtering)
-- 
-- DATA ISOLATION STRATEGY:
-- - Each MongoDB user can create multiple apps
-- - Each app has a unique app_id stored in MongoDB
-- - ClickHouse queries are filtered by app_id after ownership validation
-- - ORDER BY (app_id, timestamp, id) optimizes queries for app-level isolation
--
-- Migration Script: Add app_id support to existing logs table
-- Run this if you already have a logs table without app_id
-- CREATE DATABASE IF NOT EXISTS logs_db;

-- USE logs_db;

-- Option 1: Add column to existing table (if possible, but ClickHouse may not support ALTER for ORDER BY)
-- This will fail if the table structure is incompatible
-- ALTER TABLE logs ADD COLUMN app_id LowCardinality(String) DEFAULT 'legacy-app';

-- Option 2: Recommended - Create new table with app_id and migrate data
-- Step 1: Rename old table
-- RENAME TABLE logs TO logs_old;

-- Step 2: Create new table with app_id
-- ============================================
-- PRODUCTION-OPTIMIZED LOGS TABLE
-- ============================================

CREATE TABLE logs (
    -- Primary ID (UUID)
    id UUID DEFAULT generateUUIDv7() CODEC(ZSTD(19)),
    
    -- Application identifier
    app_id LowCardinality(String) CODEC(ZSTD(19)),
    
    -- Timestamps with optimal compression
    timestamp DateTime64(3) default now() CODEC(Delta, ZSTD(19)),
    
    -- Log level as Enum (1 byte per entry)
    level Enum8(
        'DEBUG' = 1,
        'INFO' = 2,
        'WARN' = 3,
        'ERROR' = 4,
        'FATAL' = 5
    ) default 'INFO' CODEC(ZSTD(19)),
    
    -- Log message with high compression
    message String CODEC(ZSTD(19)),

    -- Source/host information
    source LowCardinality(String) CODEC(ZSTD(19)),
    environment LowCardinality(String) CODEC(ZSTD(19)),

    -- Metadata as JSON
    metadata String CODEC(ZSTD(22)),  -- Higher compression for JSON
    
    -- Correlation IDs
    trace_id Nullable(String) CODEC(ZSTD(19)),

    -- User context
    user_id String default '' CODEC(ZSTD(19)),
    
    -- =====================================
    -- SKIP INDICES (Essential for performance)
    -- =====================================
    
    -- Full-text search on messages
    INDEX message_idx message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4,
    
    -- Fast app filtering
    INDEX app_idx app_id TYPE set(1000) GRANULARITY 4,
    
    -- Bloom filter indexes for high-cardinality lookups
    INDEX trace_idx trace_id TYPE bloom_filter(0.01) GRANULARITY 3,
    INDEX user_idx user_id TYPE bloom_filter(0.01) GRANULARITY 3,

        -- Database-level constraints
    CONSTRAINT check_app_id CHECK length(app_id) > 0 AND length(app_id) <= 32,
    CONSTRAINT check_message CHECK length(message) > 0 AND length(message) <= 2048,
    CONSTRAINT check_source CHECK length(source) > 0 AND length(source) <= 64,
    CONSTRAINT check_level CHECK level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'),
    CONSTRAINT check_timestamp CHECK timestamp >= toDateTime64('2020-01-01 00:00:00', 3),
    CONSTRAINT check_environment CHECK length(environment) > 0 AND length(environment) <= 64,

) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (app_id, timestamp, id)
TTL timestamp + INTERVAL 90 DAY
SETTINGS
    -- Performance optimized settings for 100k/sec ingestion
    index_granularity = 16384,                    -- Larger granularity for faster inserts
    min_bytes_for_wide_part = 20971520,          -- 20 MB threshold for wide format
    max_compress_block_size = 2097152,           -- 2 MB compression blocks (larger = faster)

    -- Merge optimization for high-throughput scenarios
    merge_max_block_size = 8192,                  -- Larger merge blocks
    merge_max_block_size_bytes = 104857600,      -- 100MB merge size limit

    -- Storage optimization
    storage_policy = 'default',                   -- Use default storage policy
    min_bytes_for_compact_part = 10485760,       -- 10MB compact threshold

    -- Write optimization
    write_ahead_log_max_bytes = 1073741824,      -- 1GB WAL size
    write_ahead_log_bytes_to_fsync = 4194304,    -- 4MB fsync threshold

    -- Memory settings for merges
    max_bytes_to_merge_at_max_space_in_pool = 1073741824,  -- 1GB max merge memory
    max_bytes_to_merge_at_min_space_in_pool = 134217728;   -- 128MB min merge memory

-- Step 3: Migrate data from old table (assign default app_id)
INSERT INTO logs(
    app_id,
    timestamp,
    level,
    message,
    source,
    environment,
    metadata,
    trace_id,
    user_id
) 
SELECT 
    app_id,
    timestamp,
    level,
    message,
    source,
    environment,
    metadata,
    trace_id,
    user_id
FROM logs_old;

-- Step 4: Verify migration
SELECT 
    'Old table count' as description, 
    count() as count 
FROM logs_old
UNION ALL
SELECT 
    'New table count' as description, 
    count() as count 
FROM logs;

-- Step 5: Once verified, drop old table (CAREFUL!)
-- DROP TABLE logs_old;

SELECT 'Migration completed! Review the counts above and drop logs_old when ready.' as status;

