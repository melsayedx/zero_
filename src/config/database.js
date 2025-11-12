const { createClient } = require('@clickhouse/client');

/**
 * Create and configure ClickHouse client optimized for 100k/sec throughput
 * @returns {ClickHouseClient} Configured ClickHouse client
 */
function createClickHouseClient() {
  const client = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'logs_db',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    
    // High-throughput timeouts (100k/sec optimized)
    request_timeout: 60000,          // 60s for large batches
    connect_timeout: 10000,          // 10s connection timeout
    
    // Connection pooling for high concurrency
    max_open_connections: 100,       // Maximum concurrent connections
    max_idle_connections: 50,        // Keep 50 connections ready (50% of max)
    keep_alive: {
      enabled: true,
      idle_socket_ttl: 60000,        // 60s keep-alive for connection reuse
    },
    
    // Compression for network efficiency
    compression: {
      request: true,                 // Compress outgoing data
      response: true                 // Compress incoming data
    },
    
    // ClickHouse settings optimized for 100k/sec write throughput
    clickhouse_settings: {
      // === Async Insert Settings (Core for High Throughput) ===
      async_insert: 1,                              // Enable async inserts
      wait_for_async_insert: 0,                     // Don't wait for ACK (max speed)
      async_insert_deduplicate: 0,                  // Disable dedup (faster)
    
      // Batch accumulation settings
      async_insert_busy_timeout_ms: 200,            // Min wait: accumulate for 200ms
      async_insert_busy_timeout_max_ms: 1000,       // Max wait: flush after 1s
      async_insert_max_data_size: 10485760,         // 10MB buffer before flush
      async_insert_threads: 8,                     // Parallel async insert threads
      
      // === Write Performance Settings ===
      max_insert_threads: 8,                        // Parallel insert execution
      max_insert_block_size: 1048576,               // 1M rows per block
      min_insert_block_size_rows: 262144,           // 256K rows minimum
      min_insert_block_size_bytes: 268435456,       // 256MB minimum block size
      
      // === Memory & Processing ===
      max_memory_usage: 10737418240,                // 10GB memory limit per query
      max_threads: 8,                               // Max threads per query
      use_uncompressed_cache: 1,                    // Enable cache for faster reads  

      // === Network & Timeout Settings ===
      max_execution_time: 300,                      // 5 min max query time
      send_timeout: 300,                            // 5 min send timeout
      receive_timeout: 300,                         // 5 min receive timeout
      send_progress_in_http_headers: 0,             // Disable progress updates for performance

      // === Optimization Flags ===
      optimize_on_insert: 0,                        // Skip optimization on insert (faster)
      insert_deduplicate: 0,                        // No deduplication
      
      // === Format Settings ===
      input_format_parallel_parsing: 1,             // Parallel parsing of input data
      max_read_buffer_size: 10485760,               // 10MB read buffer

    }
  });

  return client;
}

module.exports = {
  createClickHouseClient
};

