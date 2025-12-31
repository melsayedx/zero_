#include "config.h"
#include <cstring>
#include <iostream>

namespace ingester {

static std::string get_env(const char* name, const std::string& default_value) {
    const char* value = std::getenv(name);
    return value ? std::string(value) : default_value;
}

static int get_env_int(const char* name, int default_value) {
    const char* value = std::getenv(name);
    return value ? std::atoi(value) : default_value;
}

Config Config::from_env() {
    Config cfg;
    
    // Redis
    cfg.redis_host = get_env("REDIS_HOST", cfg.redis_host);
    cfg.redis_port = get_env_int("REDIS_PORT", cfg.redis_port);
    cfg.stream_key = get_env("STREAM_KEY", cfg.stream_key);
    cfg.group_name = get_env("GROUP_NAME", cfg.group_name);
    
    // ClickHouse
    cfg.clickhouse_host = get_env("CLICKHOUSE_HOST", cfg.clickhouse_host);
    cfg.clickhouse_native_port = get_env_int("CLICKHOUSE_NATIVE_PORT", cfg.clickhouse_native_port);
    cfg.clickhouse_database = get_env("CLICKHOUSE_DATABASE", cfg.clickhouse_database);
    cfg.clickhouse_user = get_env("CLICKHOUSE_USER", cfg.clickhouse_user);
    cfg.clickhouse_password = get_env("CLICKHOUSE_PASSWORD", cfg.clickhouse_password);
    
    // Performance
    cfg.batch_size = get_env_int("BATCH_SIZE", cfg.batch_size);
    cfg.writer_threads = get_env_int("WRITER_THREADS", cfg.writer_threads);
    cfg.polling_interval_ms = get_env_int("POLLING_INTERVAL_MS", cfg.polling_interval_ms);
    
    return cfg;
}

void Config::parse_args(int argc, char** argv) {
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--benchmark") == 0) {
            benchmark_mode = true;
        } else if (std::strcmp(argv[i], "--count") == 0 && i + 1 < argc) {
            benchmark_count = std::atoi(argv[++i]);
        } else if (std::strcmp(argv[i], "--threads") == 0 && i + 1 < argc) {
            writer_threads = std::atoi(argv[++i]);
        } else if (std::strcmp(argv[i], "--batch") == 0 && i + 1 < argc) {
            batch_size = std::atoi(argv[++i]);
        } else if (std::strcmp(argv[i], "--help") == 0) {
            std::cout << "Usage: clickhouse_ingester [OPTIONS]\n"
                      << "Options:\n"
                      << "  --benchmark       Run in benchmark mode (exit after count)\n"
                      << "  --count N         Number of logs for benchmark (default: 50000)\n"
                      << "  --threads N       Number of writer threads (default: 4)\n"
                      << "  --batch N         Batch size before flush (default: 10000)\n"
                      << "  --help            Show this help\n";
            std::exit(0);
        }
    }
}

} // namespace ingester
