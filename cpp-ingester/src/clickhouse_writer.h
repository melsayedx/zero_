#pragma once

#include "config.h"
#include "log_entry.h"
#include "ring_buffer.h"

#include <atomic>
#include <vector>
#include <thread>
#include <functional>

namespace ingester {

/**
 * ClickHouse Native Protocol Writer
 * 
 * Optimizations:
 * - Native TCP protocol (port 9000)
 * - RowBinary format (fastest binary format)
 * - Thread pool for parallel batch insertions
 * - Connection pooling
 * - Pre-allocated write buffers
 */
class ClickHouseWriter {
public:
    using OnFlushCallback = std::function<void(const std::vector<std::string>&)>;
    
    explicit ClickHouseWriter(const Config& config);
    ~ClickHouseWriter();
    
    // Non-copyable
    ClickHouseWriter(const ClickHouseWriter&) = delete;
    ClickHouseWriter& operator=(const ClickHouseWriter&) = delete;
    
    /**
     * Initialize connections and start writer threads
     */
    bool start(std::vector<std::unique_ptr<LockFreeRingBuffer<LogEntry>>>& buffers, OnFlushCallback on_flush);
    
    /**
     * Stop writer threads and flush remaining data
     */
    void stop();
    
    /**
     * Force flush all pending data
     */
    void flush();
    
    // Stats
    size_t logs_written() const { return logs_written_.load(); }
    size_t batches_written() const { return batches_written_.load(); }
    size_t errors() const { return errors_.load(); }
    
private:
    void writer_thread(int thread_id, LockFreeRingBuffer<LogEntry>* buffer, OnFlushCallback on_flush);
    bool write_batch(const std::vector<LogEntry>& batch, int thread_id);
    
    const Config& config_;
    std::vector<std::thread> threads_;
    std::atomic<bool> running_{false};
    
    // Stats
    std::atomic<size_t> logs_written_{0};
    std::atomic<size_t> batches_written_{0};
    std::atomic<size_t> errors_{0};
};

} // namespace ingester
