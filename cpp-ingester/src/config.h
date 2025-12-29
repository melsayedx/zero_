#pragma once

#include <string>
#include <cstdlib>
#include <cstdint>

namespace ingester {

struct Config {
    // Redis settings
    std::string redis_host = "localhost";
    int redis_port = 6379;
    std::string stream_key = "logs:stream";
    std::string group_name = "log-processors";
    std::string consumer_name = "cpp-ingester";
    
    // ClickHouse settings
    std::string clickhouse_host = "localhost";
    int clickhouse_native_port = 9000;
    std::string clickhouse_database = "logs_db";
    std::string clickhouse_table = "logs";
    std::string clickhouse_user = "default";
    std::string clickhouse_password = "";
    
    // Performance settings
    size_t batch_size = 10000;          // Logs per batch
    size_t read_batch_size = 1000;      // Messages per XREADGROUP
    int writer_threads = 4;             // Parallel writer threads
    int block_ms = 100;                 // XREADGROUP block timeout
    size_t ring_buffer_size = 100000;   // Lock-free buffer capacity
    
    // Benchmark mode
    bool benchmark_mode = false;
    size_t benchmark_count = 50000;
    
    // Load from environment variables
    static Config from_env();
    
    // Parse command line args
    void parse_args(int argc, char** argv);
};

} // namespace ingester
