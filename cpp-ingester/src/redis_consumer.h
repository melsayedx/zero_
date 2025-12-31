#pragma once

#include "config.h"
#include "log_entry.h"
#include "ring_buffer.h"

#include <hiredis/hiredis.h>
#include <atomic>
#include <string>
#include <memory>
#include <functional>

namespace ingester {

/**
 * Redis Stream Consumer using XREADGROUP
 * 
 * Optimizations:
 * - SIMD JSON parsing via simdjson
 * - Batch message reading
 * - Automatic consumer group creation
 * - ACK batching
 */
class RedisConsumer {
public:
    using OnBatchCallback = std::function<void(std::vector<LogEntry>&&)>;
    
    explicit RedisConsumer(const Config& config);
    ~RedisConsumer();
    
    // Non-copyable
    RedisConsumer(const RedisConsumer&) = delete;
    RedisConsumer& operator=(const RedisConsumer&) = delete;
    
    /**
     * Connect to Redis and set up consumer group
     */
    bool connect();
    
    /**
     * Read messages and push to buffer
     * Returns number of messages read
     */
    size_t read_batch(LockFreeRingBuffer<LogEntry>& buffer);
    
    /**
     * Acknowledge processed messages
     */
    void ack_batch(const std::vector<std::string>& ids);
    
    /**
     * Process pending messages (crash recovery)
     */
    size_t recover_pending(LockFreeRingBuffer<LogEntry>& buffer);
    
    /**
     * Get current stream length
     */
    size_t get_stream_length();
    
    void stop() { running_.store(false); }
    bool is_running() const { return running_.load(); }

private:
    bool ensure_consumer_group();
    LogEntry parse_message(const char* json_data, size_t len, const char* msg_id);
    
    const Config& config_;
    redisContext* redis_read_ = nullptr;
    redisContext* redis_write_ = nullptr;
    std::mutex write_mutex_;
    std::atomic<bool> running_{true};
    
    // Stats
    std::atomic<size_t> messages_read_{0};
    std::atomic<size_t> parse_errors_{0};
};

} // namespace ingester
