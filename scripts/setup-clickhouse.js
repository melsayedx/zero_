/**
 * ClickHouse Setup Script
 * Initialize ClickHouse database and tables
 */

require('dotenv').config();
const { createClient } = require('@clickhouse/client');

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'localhost';
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || 8123;
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'logs_db';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';

async function setupClickHouse() {
  const client = createClient({
    host: `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}`,
    username: CLICKHOUSE_USER,
    password: CLICKHOUSE_PASSWORD
  });

  try {
    console.log('Connecting to ClickHouse...');
    
    // Test connection
    await client.query({
      query: 'SELECT 1',
      format: 'JSONEachRow'
    });
    console.log('✓ Connected to ClickHouse');

    // Create database
    console.log('\nCreating database...');
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}`
    });
    console.log(`✓ Database created: ${CLICKHOUSE_DATABASE}`);

    // Use the database
    const dbClient = createClient({
      host: `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}`,
      username: CLICKHOUSE_USER,
      password: CLICKHOUSE_PASSWORD,
      database: CLICKHOUSE_DATABASE
    });

    // Create main logs table
    console.log('\nCreating logs table...');
    await dbClient.command({
      query: `
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
        SETTINGS index_granularity = 8192
      `
    });
    console.log('✓ Logs table created');

    // Create materialized view for log levels
    console.log('\nCreating materialized views...');
    await dbClient.command({
      query: `
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
        GROUP BY hour, service, level
      `
    });
    console.log('✓ logs_by_level_mv created');

    // Create materialized view for errors
    await dbClient.command({
      query: `
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
        WHERE level IN ('ERROR', 'FATAL')
      `
    });
    console.log('✓ error_logs_mv created');

    // Create materialized view for service metrics
    await dbClient.command({
      query: `
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
        GROUP BY minute, service, level
      `
    });
    console.log('✓ service_metrics_mv created');

    // Verify tables
    console.log('\nVerifying tables...');
    const result = await dbClient.query({
      query: 'SHOW TABLES',
      format: 'JSONEachRow'
    });
    
    const tables = await result.json();
    console.log('✓ Tables in database:');
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });

    // Insert sample log (optional)
    console.log('\nInserting sample log...');
    await dbClient.insert({
      table: 'logs',
      values: [{
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'ClickHouse setup completed successfully',
        service: 'setup-script',
        metadata: { type: 'system', action: 'initialization' },
        host: require('os').hostname(),
        environment: 'development',
        trace_id: '',
        span_id: ''
      }],
      format: 'JSONEachRow'
    });
    console.log('✓ Sample log inserted');

    console.log('\n✅ ClickHouse setup completed successfully!');

    await dbClient.close();
    await client.close();

  } catch (error) {
    console.error('❌ ClickHouse setup failed:', error.message);
    throw error;
  }
}

// Run setup
if (require.main === module) {
  setupClickHouse()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = setupClickHouse;

