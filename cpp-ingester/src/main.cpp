#include "config.h"
#include "redis_consumer.h"
#include "clickhouse_writer.h"
#include "ring_buffer.h"

#include <iostream>
#include <chrono>
#include <thread>
#include <signal.h>
#include <atomic>

using namespace ingester;

// Global flag for signal handling
std::atomic<bool> g_running{true};

void signal_handler(int sig) {
    std::cout << "\nReceived signal " << sig << ", shutting down...\n";
    g_running.store(false);
}

int main(int argc, char** argv) {
    // Parse configuration
    Config config = Config::from_env();
    config.parse_args(argc, argv);
    
    std::cout << "===========================================\n";
    std::cout << " C++ ClickHouse Native Ingester\n";
    std::cout << "===========================================\n";
    std::cout << "Redis: " << config.redis_host << ":" << config.redis_port << "\n";
    std::cout << "Stream: " << config.stream_key << " (group: " << config.group_name << ")\n";
    std::cout << "ClickHouse: " << config.clickhouse_host << ":" << config.clickhouse_native_port << "\n";
    std::cout << "Writer threads: " << config.writer_threads << "\n";
    std::cout << "Batch size: " << config.batch_size << "\n";
    if (config.benchmark_mode) {
        std::cout << "Mode: BENCHMARK (" << config.benchmark_count << " logs)\n";
    }
    std::cout << "===========================================\n\n";
    
    // Set up signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    // Create components
    std::vector<std::unique_ptr<LockFreeRingBuffer<LogEntry>>> buffers;
    buffers.reserve(config.writer_threads);
    for (int i = 0; i < config.writer_threads; ++i) {
        buffers.push_back(std::make_unique<LockFreeRingBuffer<LogEntry>>(config.ring_buffer_size));
    }
    
    RedisConsumer consumer(config);
    ClickHouseWriter writer(config);
    
    // Connect to Redis
    if (!consumer.connect()) {
        std::cerr << "Failed to connect to Redis\n";
        return 1;
    }
    
    // ACK callback - called when batch is successfully written to ClickHouse
    auto on_flush = [&consumer](const std::vector<std::string>& ids) {
        consumer.ack_batch(ids);
    };
    
    // Start writer threads
    if (!writer.start(buffers, on_flush)) {
        std::cerr << "Failed to start writer threads\n";
        return 1;
    }
    
    // Recover any pending messages from previous runs
    size_t recovered = consumer.recover_pending(buffers);
    if (recovered > 0) {
        std::cout << "Recovered " << recovered << " pending messages\n";
    }
    
    // Benchmark timing
    auto start_time = std::chrono::high_resolution_clock::now();
    size_t total_read = recovered;
    
    // Main read loop
    std::cout << "Starting ingestion...\n";
    while (g_running.load() && consumer.is_running()) {
        size_t read = consumer.read_batch(buffers);
        total_read += read;
        
        // Benchmark mode: exit after target count
        if (config.benchmark_mode && writer.logs_written() >= config.benchmark_count) {
            break;
        }
        
        // Progress reporting every 10k logs
        if (total_read % 10000 < config.read_batch_size) {
            size_t total_buffer = 0;
            for (const auto& buf : buffers) total_buffer += buf->size();
            
            std::cout << "Read: " << total_read 
                      << " | Written: " << writer.logs_written()
                      << " | Buffer: " << total_buffer << "\n";
        }
    }
    
    consumer.stop();
    
    // Wait for writer to drain
    std::cout << "Waiting for writers to drain...\n";
    writer.stop();
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
    
    // Final stats
    std::cout << "\n===========================================\n";
    std::cout << " Results\n";
    std::cout << "===========================================\n";
    std::cout << "Total read: " << total_read << " logs\n";
    std::cout << "Total written: " << writer.logs_written() << " logs\n";
    std::cout << "Batches: " << writer.batches_written() << "\n";
    std::cout << "Errors: " << writer.errors() << "\n";
    std::cout << "Duration: " << duration.count() << " ms\n";
    
    if (duration.count() > 0) {
        double throughput = (writer.logs_written() * 1000.0) / duration.count();
        std::cout << "Throughput: " << static_cast<size_t>(throughput) << " logs/sec\n";
    }
    std::cout << "===========================================\n";
    
    return 0;
}
