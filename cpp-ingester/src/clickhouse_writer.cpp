#include "clickhouse_writer.h"
#include <clickhouse/client.h>
#include <iostream>
#include <chrono>

namespace ingester {

using namespace clickhouse;

ClickHouseWriter::ClickHouseWriter(const Config& config) : config_(config) {}

ClickHouseWriter::~ClickHouseWriter() {
    stop();
}

bool ClickHouseWriter::start(std::vector<std::unique_ptr<LockFreeRingBuffer<LogEntry>>>& buffers, OnFlushCallback on_flush) {
    if (running_.load()) return false;
    running_.store(true);
    
    if (buffers.size() != config_.writer_threads) {
        std::cerr << "Error: Buffer count (" << buffers.size() << ") != Writer threads (" << config_.writer_threads << ")\n";
        return false;
    }
    
    // Start writer threads
    for (int i = 0; i < config_.writer_threads; ++i) {
        threads_.emplace_back(&ClickHouseWriter::writer_thread, this, i, 
                              buffers[i].get(), on_flush);
    }
    
    std::cout << "Started " << config_.writer_threads << " writer threads\n";
    return true;
}

void ClickHouseWriter::stop() {
    if (!running_.load()) return;
    running_.store(false);
    
    for (auto& t : threads_) {
        if (t.joinable()) {
            t.join();
        }
    }
    threads_.clear();
}

void ClickHouseWriter::flush() {
    // Let threads naturally drain their buffers
}

void ClickHouseWriter::writer_thread(int thread_id, LockFreeRingBuffer<LogEntry>* buffer, 
                                      OnFlushCallback on_flush) {
    // Each thread has its own ClickHouse connection
    ClientOptions options;
    options.SetHost(config_.clickhouse_host);
    options.SetPort(config_.clickhouse_native_port);
    options.SetDefaultDatabase(config_.clickhouse_database);
    options.SetUser(config_.clickhouse_user);
    options.SetPassword(config_.clickhouse_password);
    options.SetSendRetries(3);
    options.SetRetryTimeout(std::chrono::seconds(5));
    options.SetConnectionRecvTimeout(std::chrono::seconds(5));
    options.SetConnectionSendTimeout(std::chrono::seconds(5));
    options.SetCompressionMethod(CompressionMethod::LZ4);  // Disable to test
    
    std::unique_ptr<Client> client;
    try {
        client = std::make_unique<Client>(options);
        std::cout << "Writer thread " << thread_id << " connected to ClickHouse\n";
    } catch (const std::exception& e) {
        std::cerr << "Writer thread " << thread_id << " failed to connect: " << e.what() << "\n";
        return;
    }
    
    // Pre-allocated batch buffer
    std::vector<LogEntry> batch;
    batch.reserve(config_.batch_size);

    auto write_with_retry = [&](std::vector<LogEntry>& b) {
        int retries = 3;
        while (retries > 0) {
            if (write_batch(b, *client, thread_id)) {
                return true;
            }
            std::cerr << "Thread " << thread_id << " write failed. Retrying... (" << retries << " left)\n";
            
            // Reconnect attempt
            try {
                client = std::make_unique<Client>(options);
                std::cout << "Thread " << thread_id << " reconnected\n";
            } catch (const std::exception& e) {
                std::cerr << "Thread " << thread_id << " reconnection failed: " << e.what() << "\n";
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            retries--;
        }
        return false;
    };
    
    while (running_.load() || !buffer->empty()) {
        // Pop logs from ring buffer
        size_t popped = buffer->pop_batch(batch, config_.batch_size - batch.size());
        
        // Flush when batch is full or timeout (simple: just check size)
        if (batch.size() >= config_.batch_size) {
            if (write_with_retry(batch)) {
                // Collect Redis IDs for ACK
                if (on_flush) {
                    std::vector<std::string> ids;
                    ids.reserve(batch.size());
                    for (const auto& entry : batch) {
                        if (!entry.redis_id.empty()) {
                            ids.push_back(entry.redis_id);
                        }
                    }
                    on_flush(ids);
                }
            }
            batch.clear();
        } else if (popped == 0) {
            // No data, small sleep to avoid busy spinning
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            
            // Flush partial batch if we've been waiting
            if (!batch.empty()) {
                if (write_with_retry(batch)) {
                    if (on_flush) {
                        std::vector<std::string> ids;
                        for (const auto& entry : batch) {
                            if (!entry.redis_id.empty()) {
                                ids.push_back(entry.redis_id);
                            }
                        }
                        on_flush(ids);
                    }
                }
                batch.clear();
            }
        }
    }
    
    // Final flush
    if (!batch.empty()) {
        if (write_with_retry(batch)) {
            if (on_flush) {
                std::vector<std::string> ids;
                for (const auto& entry : batch) {
                    if (!entry.redis_id.empty()) {
                        ids.push_back(entry.redis_id);
                    }
                }
                on_flush(ids);
            }
        }
    }
}

bool ClickHouseWriter::write_batch(const std::vector<LogEntry>& batch, Client& client, int thread_id) {
    if (batch.empty()) return true;
    
    try {
        // Build columns for batch insert
        auto app_id = std::make_shared<ColumnString>();
        auto message = std::make_shared<ColumnString>();
        auto source = std::make_shared<ColumnString>();
        auto level = std::make_shared<ColumnString>();
        auto environment = std::make_shared<ColumnString>();
        auto metadata = std::make_shared<ColumnString>();
        auto trace_id = std::make_shared<ColumnString>();
        auto user_id = std::make_shared<ColumnString>();
        
        // Fill columns
        for (const auto& entry : batch) {
            app_id->Append(entry.app_id);
            message->Append(entry.message);
            source->Append(entry.source);
            level->Append(entry.level);
            environment->Append(entry.environment);
            metadata->Append(entry.metadata);
            trace_id->Append(entry.trace_id);
            user_id->Append(entry.user_id);
        }
        
        // Build block
        Block block;
        block.AppendColumn("app_id", app_id);
        block.AppendColumn("message", message);
        block.AppendColumn("source", source);
        block.AppendColumn("level", level);
        block.AppendColumn("environment", environment);
        block.AppendColumn("metadata", metadata);
        block.AppendColumn("trace_id", trace_id);
        block.AppendColumn("user_id", user_id);
        
        // Use passed client
        std::cout << "Thread " << thread_id << " inserting batch of " << batch.size() << "\n";
        client.Insert(config_.clickhouse_table, block);
        std::cout << "Thread " << thread_id << " insert complete\n";
        
        logs_written_ += batch.size();
        ++batches_written_;
        return true;
        
    } catch (const std::exception& e) {
        std::cerr << "Write error (thread " << thread_id << "): " << e.what() << "\n";
        ++errors_;
        return false;
    }
}

} // namespace ingester
