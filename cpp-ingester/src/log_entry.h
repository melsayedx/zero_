#pragma once

#include <string>
#include <cstdint>

namespace ingester {

/**
 * Log entry structure matching the logs table schema
 */
struct LogEntry {
    std::string app_id;
    std::string message;
    std::string source;
    std::string level;
    std::string environment;
    std::string metadata;      // JSON string
    std::string trace_id;
    std::string user_id;
    std::string redis_id;      // For ACK tracking
    
    // Pre-calculated for RowBinary serialization
    size_t estimated_size() const {
        return app_id.size() + message.size() + source.size() + 
               level.size() + environment.size() + metadata.size() +
               trace_id.size() + user_id.size() + 64; // overhead
    }
};

} // namespace ingester
