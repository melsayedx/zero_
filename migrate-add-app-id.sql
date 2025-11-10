-- Migration Script: Add app_id support to existing logs table
-- Run this if you already have a logs table without app_id

USE logs_db;

-- Option 1: Add column to existing table (if possible, but ClickHouse may not support ALTER for ORDER BY)
-- This will fail if the table structure is incompatible
-- ALTER TABLE logs ADD COLUMN app_id LowCardinality(String) DEFAULT 'legacy-app';

-- Option 2: Recommended - Create new table with app_id and migrate data
-- Step 1: Rename old table
RENAME TABLE logs TO logs_old;

-- Step 2: Create new table with app_id
CREATE TABLE logs (
    id String CODEC(ZSTD(19)),
    app_id LowCardinality(String) CODEC(ZSTD(19)),
    timestamp DateTime64(3) CODEC(Delta, ZSTD(19)),
    level LowCardinality(String) CODEC(ZSTD(19)),
    message String CODEC(ZSTD(19)),
    source LowCardinality(String) CODEC(ZSTD(19)),
    metadata String CODEC(ZSTD(19)),
    trace_id String CODEC(ZSTD(19)),
    user_id String CODEC(ZSTD(19)),
    created_at DateTime CODEC(ZSTD(19)) DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY (toYYYYMM(timestamp), app_id)
ORDER BY (app_id, timestamp, level, source)
TTL timestamp + INTERVAL 90 DAY
CODEC(ZSTD(19)),
SETTINGS index_granularity = 8192,
codec_config = {
    'delta': {
        'min_level': 19,
        'max_level': 19
    },
    'zstd': {
        'min_level': 19,
        'max_level': 19
    }
};
-- Step 3: Migrate data from old table (assign default app_id)
INSERT INTO logs 
SELECT 
    id,
    'legacy-app' as app_id,  -- Default app_id for existing logs
    timestamp,
    level,
    message,
    source,
    metadata,
    trace_id,
    user_id,
    created_at
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

