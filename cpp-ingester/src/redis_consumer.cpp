#include "redis_consumer.h"
#include <iostream>
#include <cstring>
#include <sstream>
#include <thread>

namespace ingester {

RedisConsumer::RedisConsumer(const Config& config) : config_(config) {}

RedisConsumer::~RedisConsumer() {
    stop();
    if (redis_read_) redisFree(redis_read_);
    if (redis_write_) redisFree(redis_write_);
}

bool RedisConsumer::connect() {
    struct timeval timeout = {5, 0};
    
    // Connection 1: Reader (Blocking)
    redis_read_ = redisConnectWithTimeout(
        config_.redis_host.c_str(), 
        config_.redis_port, 
        timeout
    );
    
    if (redis_read_ == nullptr || redis_read_->err) {
        std::cerr << "Redis Read connection error: " << (redis_read_ ? redis_read_->errstr : "alloc fail") << std::endl;
        return false;
    }

    // Connection 2: Writer (ACKs)
    redis_write_ = redisConnectWithTimeout(
        config_.redis_host.c_str(), 
        config_.redis_port, 
        timeout
    );

    if (redis_write_ == nullptr || redis_write_->err) {
        std::cerr << "Redis Write connection error: " << (redis_write_ ? redis_write_->errstr : "alloc fail") << std::endl;
        return false;
    }
    
    std::cout << "Connected to Redis at " << config_.redis_host << ":" << config_.redis_port << " (Read & Write connections)\n";
    
    return ensure_consumer_group();
}

bool RedisConsumer::ensure_consumer_group() {
    // Use write connection for setup commands
    std::lock_guard<std::mutex> lock(write_mutex_);
    
    redisReply* reply = static_cast<redisReply*>(redisCommand(
        redis_write_,
        "XGROUP CREATE %s %s $ MKSTREAM",
        config_.stream_key.c_str(),
        config_.group_name.c_str()
    ));
    
    if (reply) {
        bool success = (reply->type == REDIS_REPLY_STATUS) ||
                       (reply->type == REDIS_REPLY_ERROR && 
                        strstr(reply->str, "BUSYGROUP") != nullptr);
        freeReplyObject(reply);
        return success;
    }
    return false;
}

size_t RedisConsumer::read_batch(std::vector<std::unique_ptr<LockFreeRingBuffer<LogEntry>>>& buffers) {
    if (buffers.empty()) return 0;
    
    // No lock needed here! Only one reader thread uses redis_read_
    
    std::string count_str = std::to_string(config_.read_batch_size);
    
    std::vector<const char*> argv;
    std::vector<size_t> argvlen;
    
    argv.push_back("XREADGROUP");
    argvlen.push_back(10);
    
    argv.push_back("GROUP");
    argvlen.push_back(5);
    
    argv.push_back(config_.group_name.c_str());
    argvlen.push_back(config_.group_name.size());
    
    argv.push_back(config_.consumer_name.c_str());
    argvlen.push_back(config_.consumer_name.size());
    
    // Only use BLOCK if polling is disabled (interval <= 0)
    // If polling is enabled, we want a non-blocking check
    std::string block_str;
    if (config_.polling_interval_ms <= 0 && config_.block_ms > 0) {
        block_str = std::to_string(config_.block_ms);
        argv.push_back("BLOCK");
        argvlen.push_back(5);
        
        argv.push_back(block_str.c_str());
        argvlen.push_back(block_str.size());
    }
    
    argv.push_back("COUNT");
    argvlen.push_back(5);
    
    argv.push_back(count_str.c_str());
    argvlen.push_back(count_str.size());
    
    argv.push_back("STREAMS");
    argvlen.push_back(7);
    
    argv.push_back(config_.stream_key.c_str());
    argvlen.push_back(config_.stream_key.size());
    
    argv.push_back(">");
    argvlen.push_back(1);
    
    redisReply* reply = static_cast<redisReply*>(redisCommandArgv(
        redis_read_, 
        static_cast<int>(argv.size()), 
        argv.data(), 
        argvlen.data()
    ));
    
    if (!reply) {
        if (redis_read_) std::cerr << "XREADGROUP failed: " << redis_read_->errstr << std::endl;
        return 0;
    }
    
    if (reply->type == REDIS_REPLY_NIL || reply->type != REDIS_REPLY_ARRAY) {
        freeReplyObject(reply);
        return 0;
    }
    
    size_t count = 0;
    
    if (reply->elements > 0) {
        redisReply* stream = reply->element[0];
        if (stream && stream->type == REDIS_REPLY_ARRAY && stream->elements >= 2) {
            redisReply* messages = stream->element[1];
            
            if (messages && messages->type == REDIS_REPLY_ARRAY) {
                for (size_t i = 0; i < messages->elements; ++i) {
                    redisReply* msg = messages->element[i];
                    if (!msg || msg->type != REDIS_REPLY_ARRAY || msg->elements < 2) continue;
                    
                    redisReply* idReply = msg->element[0];
                    if (!idReply || !idReply->str) continue;
                    
                    const char* msg_id = idReply->str;
                    redisReply* fields = msg->element[1];
                    
                    if (fields && fields->type == REDIS_REPLY_ARRAY && fields->elements >= 2) {
                        for (size_t j = 0; j < fields->elements - 1; j += 2) {
                            redisReply* keyReply = fields->element[j];
                            redisReply* valReply = fields->element[j + 1];
                            
                            if (!keyReply || !keyReply->str || !valReply || !valReply->str) continue;
                            
                            if (strcmp(keyReply->str, "data") == 0) {
                                try {
                                    LogEntry entry = parse_message(valReply->str, valReply->len, msg_id);
                                    
                                    // Round-robin distribution
                                    // Try current buffer, if full, try next one
                                    bool pushed = false;
                                    size_t start_idx = current_buffer_idx_;
                                    
                                    do {
                                        if (buffers[current_buffer_idx_]->try_push(std::move(entry))) {
                                            pushed = true;
                                            current_buffer_idx_ = (current_buffer_idx_ + 1) % buffers.size();
                                            ++count;
                                            break;
                                        }
                                        current_buffer_idx_ = (current_buffer_idx_ + 1) % buffers.size();
                                    } while (current_buffer_idx_ != start_idx);
                                    
                                    if (!pushed) {
                                        // All buffers full, drop message or block?
                                        // For high throughput, we drop but log error (or backpressure logic)
                                        // Simple version: just stop reading this batch
                                        break; 
                                    }

                                } catch (const std::exception& e) {
                                    ++parse_errors_;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    freeReplyObject(reply);
    messages_read_ += count;
    return count;
}

// Simple JSON string value extractor
static std::string extract_json_value(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\":\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";
    
    pos += search.length();
    size_t end = json.find("\"", pos);
    if (end == std::string::npos) return "";
    
    while (end > 0 && json[end - 1] == '\\') {
        end = json.find("\"", end + 1);
        if (end == std::string::npos) return "";
    }
    
    return json.substr(pos, end - pos);
}

LogEntry RedisConsumer::parse_message(const char* json_data, size_t len, const char* msg_id) {
    std::string json(json_data, len);
    
    LogEntry entry;
    entry.redis_id = msg_id;
    
    entry.app_id = extract_json_value(json, "appId");
    if (entry.app_id.empty()) entry.app_id = "unknown";
    
    entry.message = extract_json_value(json, "message");
    if (entry.message.empty()) entry.message = "empty";
    
    entry.source = extract_json_value(json, "source");
    if (entry.source.empty()) entry.source = "unknown";
    
    // Level must match ClickHouse Enum - default to INFO
    entry.level = extract_json_value(json, "level");
    if (entry.level.empty() || 
        (entry.level != "DEBUG" && entry.level != "INFO" && 
         entry.level != "WARN" && entry.level != "ERROR" && entry.level != "FATAL")) {
        entry.level = "INFO";
    }
    
    entry.environment = extract_json_value(json, "environment");
    if (entry.environment.empty()) entry.environment = "development";
    
    entry.trace_id = extract_json_value(json, "traceId");
    entry.user_id = extract_json_value(json, "userId");
    
    std::string metadata = extract_json_value(json, "metadataString");
    entry.metadata = metadata.empty() ? "{}" : metadata;
    
    return entry;
}

void RedisConsumer::ack_batch(const std::vector<std::string>& ids) {
    if (ids.empty()) return;
    
    // Use write connection with lock
    std::lock_guard<std::mutex> lock(write_mutex_);
    
    std::vector<const char*> argv;
    std::vector<size_t> argvlen;
    
    argv.push_back("XACK");
    argvlen.push_back(4);
    
    argv.push_back(config_.stream_key.c_str());
    argvlen.push_back(config_.stream_key.size());
    
    argv.push_back(config_.group_name.c_str());
    argvlen.push_back(config_.group_name.size());
    
    for (const auto& id : ids) {
        argv.push_back(id.c_str());
        argvlen.push_back(id.size());
    }
    
    redisReply* reply = static_cast<redisReply*>(redisCommandArgv(
        redis_write_,
        static_cast<int>(argv.size()),
        argv.data(),
        argvlen.data()
    ));
    
    if (reply) {
        freeReplyObject(reply);
    }
}

size_t RedisConsumer::recover_pending(std::vector<std::unique_ptr<LockFreeRingBuffer<LogEntry>>>& buffers) {
    if (buffers.empty()) return 0;

    // Can use read connection here safely since main loop hasn't started
    // OR use write connection. Let's use read connection to keep "reading" logic together.
    
    std::string count_str = std::to_string(config_.read_batch_size);
    
    const char* argv[] = {
        "XREADGROUP", "GROUP",
        config_.group_name.c_str(),
        config_.consumer_name.c_str(),
        "COUNT", count_str.c_str(),
        "STREAMS", config_.stream_key.c_str(),
        "0"
    };
    size_t argvlen[] = {
        10, 5,
        config_.group_name.size(),
        config_.consumer_name.size(),
        5, count_str.size(),
        7, config_.stream_key.size(),
        1
    };
    
    redisReply* reply = static_cast<redisReply*>(redisCommandArgv(
        redis_read_, 9, argv, argvlen
    ));
    
    size_t count = 0;
    if (!reply || reply->type == REDIS_REPLY_NIL || reply->type != REDIS_REPLY_ARRAY) {
        if (reply) freeReplyObject(reply);
        return 0;
    }
    
    if (reply->elements > 0) {
        redisReply* stream = reply->element[0];
        if (stream && stream->type == REDIS_REPLY_ARRAY && stream->elements >= 2) {
            redisReply* messages = stream->element[1];
            if (messages && messages->type == REDIS_REPLY_ARRAY) {
                for (size_t i = 0; i < messages->elements; ++i) {
                    redisReply* msg = messages->element[i];
                    if (!msg || msg->type != REDIS_REPLY_ARRAY || msg->elements < 2) continue;
                    
                    redisReply* idReply = msg->element[0];
                    if (!idReply || !idReply->str) continue;
                    
                    const char* msg_id = idReply->str;
                    redisReply* fields = msg->element[1];
                    
                    if (fields && fields->type == REDIS_REPLY_ARRAY && fields->elements >= 2) {
                        for (size_t j = 0; j < fields->elements - 1; j += 2) {
                            redisReply* keyReply = fields->element[j];
                            redisReply* valReply = fields->element[j + 1];
                            
                            if (!keyReply || !keyReply->str || !valReply || !valReply->str) continue;
                            
                            if (strcmp(keyReply->str, "data") == 0) {
                                try {
                                    LogEntry entry = parse_message(valReply->str, valReply->len, msg_id);
                                    
                                    // Round-robin
                                    bool pushed = false;
                                    size_t start_idx = current_buffer_idx_;
                                    
                                    do {
                                        if (buffers[current_buffer_idx_]->try_push(std::move(entry))) {
                                            pushed = true;
                                            current_buffer_idx_ = (current_buffer_idx_ + 1) % buffers.size();
                                            ++count;
                                            break;
                                        }
                                        current_buffer_idx_ = (current_buffer_idx_ + 1) % buffers.size();
                                    } while (current_buffer_idx_ != start_idx);
                                    
                                } catch (...) {
                                    ++parse_errors_;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if (reply) freeReplyObject(reply);
    return count;
}

size_t RedisConsumer::get_stream_length() {
    std::lock_guard<std::mutex> lock(write_mutex_);
    
    redisReply* reply = static_cast<redisReply*>(redisCommand(
        redis_write_,
        "XLEN %s",
        config_.stream_key.c_str()
    ));
    
    size_t len = 0;
    if (reply && reply->type == REDIS_REPLY_INTEGER) {
        len = reply->integer;
    }
    if (reply) freeReplyObject(reply);
    return len;
}

} // namespace ingester
