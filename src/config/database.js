const { createClient } = require('@clickhouse/client');

/**
 * Create and configure ClickHouse client optimized for 100k/sec throughput
 * @returns {ClickHouseClient} Configured ClickHouse client
 */
function createClickHouseClient() {
  const client = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://127.0.0.1:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'logs_db',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',

    // Connection timeouts optimized for high throughput
    request_timeout: 60000,           // 60s for large batches
    connect_timeout: 5000,            // 5s connection timeout

    // Enhanced keep-alive for connection reuse
    keep_alive: {
      enabled: true,
      idle_socket_ttl: 60000,         // 60s socket TTL (up from 45s)
    },

    // Optimized async insert settings for 100k/sec
    clickhouse_settings: {
      async_insert: 1,                       // Enable async inserts
      async_insert_busy_timeout_max_ms: 50,  // Allow more time for busy periods
      async_insert_max_data_size: 5242880,   // 5MB buffer (up from 1MB)
      wait_for_async_insert: 0,              // Don't wait for completion
      async_insert_deduplicate: 0,           // Disable deduplication for speed

      // Additional performance settings
      max_threads: 8,                        // Allow parallel processing
      max_insert_threads: 8,                 // Parallel insert threads
      max_memory_usage: 1073741824,          // 1GB memory limit
      max_memory_usage_for_user: 858993459,  // 850MB user memory

      // Query optimization
      max_result_rows: 10000,                // Limit result sets
      max_result_bytes: 104857600,           // 100MB result limit
      read_overflow_mode: 'break',           // Break on overflow
    },

    // Connection pooling for high concurrency
    max_open_connections: 50,          // Increased from default 10
    max_idle_connections: 30,          // Increased from 20

    // Compression settings
    compression: {
      request: true,                   // Compress requests
      response: true                   // Compress responses
    }
  });

  return client;
}

module.exports = {
  createClickHouseClient
};

