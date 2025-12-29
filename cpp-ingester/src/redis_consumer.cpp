#include "redis_consumer.h"
#include <iostream>
#include <cstring>
#include <sstream>
#include <mutex>

namespace ingester {

// Mutex to protect Redis connection (hiredis is not thread-safe)
static std::mutex redis_mutex;

RedisConsumer::RedisConsumer(const Config& config) : config_(config) {}

RedisConsumer::~RedisConsumer() {
    if (redis_) {
        redisFree(redis_);
    }
}

bool RedisConsumer::connect() {
    struct timeval timeout = {5, 0};
    redis_ = redisConnectWithTimeout(
        config_.redis_host.c_str(), 
        config_.redis_port, 
        timeout
    );
    
    if (redis_ == nullptr || redis_->err) {
        if (redis_) {
            std::cerr << "Redis connection error: " << redis_->errstr << std::endl;
            redisFree(redis_);
            redis_ = nullptr;
        } else {
            std::cerr << "Redis connection error: can't allocate redis context\n";
        }
        return false;
    }
    
    std::cout << "Connected to Redis at " << config_.redis_host 
              << ":" << config_.redis_port << std::endl;
    
    return ensure_consumer_group();
}

bool RedisConsumer::ensure_consumer_group() {
    std::lock_guard<std::mutex> lock(redis_mutex);
    
    redisReply* reply = static_cast<redisReply*>(redisCommand(
        redis_,
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

size_t RedisConsumer::read_batch(LockFreeRingBuffer<LogEntry>& buffer) {
    std::lock_guard<std::mutex> lock(redis_mutex);
    
    std::string block_str = std::to_string(config_.block_ms);
    std::string count_str = std::to_string(config_.read_batch_size);
    
    const char* argv[] = {
        "XREADGROUP", "GROUP",
        config_.group_name.c_str(),
        config_.consumer_name.c_str(),
        "BLOCK", block_str.c_str(),
        "COUNT", count_str.c_str(),
        "STREAMS", config_.stream_key.c_str(),
        ">"
    };
    size_t argvlen[] = {
        10, 5,
        config_.group_name.size(),
        config_.consumer_name.size(),
        5, block_str.size(),
        5, count_str.size(),
        7, config_.stream_key.size(),
        1
    };
    
    redisReply* reply = static_cast<redisReply*>(redisCommandArgv(
        redis_, 11, argv, argvlen
    ));
    
    if (!reply) {
        std::cerr << "XREADGROUP failed: " << redis_->errstr << std::endl;
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
                                    if (buffer.try_push(std::move(entry))) {
                                        ++count;
                                    } else {
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
    
    std::lock_guard<std::mutex> lock(redis_mutex);
    
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
        redis_,
        static_cast<int>(argv.size()),
        argv.data(),
        argvlen.data()
    ));
    
    if (reply) {
        freeReplyObject(reply);
    }
}

size_t RedisConsumer::recover_pending(LockFreeRingBuffer<LogEntry>& buffer) {
    std::lock_guard<std::mutex> lock(redis_mutex);
    
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
        redis_, 9, argv, argvlen
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
                                    if (buffer.try_push(std::move(entry))) {
                                        ++count;
                                    }
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
    std::lock_guard<std::mutex> lock(redis_mutex);
    
    redisReply* reply = static_cast<redisReply*>(redisCommand(
        redis_,
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
