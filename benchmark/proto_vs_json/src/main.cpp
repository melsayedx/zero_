#include "log-entry.pb.h"
#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <sstream>
#include <iomanip>

// Naive JSON extractor from current codebase
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

struct NativeLogEntry {
    std::string app_id;
    std::string message;
    std::string source;
    std::string level;
    std::string environment;
    std::string metadata;
    std::string trace_id;
    std::string user_id;
};

NativeLogEntry parse_json_naive(const std::string& json) {
    NativeLogEntry entry;
    entry.app_id = extract_json_value(json, "appId");
    entry.message = extract_json_value(json, "message");
    entry.source = extract_json_value(json, "source");
    entry.level = extract_json_value(json, "level");
    entry.environment = extract_json_value(json, "environment");
    entry.metadata = extract_json_value(json, "metadataString");
    entry.trace_id = extract_json_value(json, "traceId");
    entry.user_id = extract_json_value(json, "userId");
    return entry;
}

int main() {
    constexpr int ITERATIONS = 100000;
    
    // 1. Prepare Data
    std::string json_data = R"({
        "appId": "benchmark-app",
        "message": "This is a benchmark log entry for testing performance",
        "source": "benchmark-host",
        "level": "INFO",
        "environment": "production",
        "metadataString": "{\"key1\":\"value1\",\"key2\":\"value2\"}",
        "traceId": "trace-12345-67890",
        "userId": "user-98765"
    })";
    
    logs::LogEntry proto_entry;
    proto_entry.set_app_id("benchmark-app");
    proto_entry.set_message("This is a benchmark log entry for testing performance");
    proto_entry.set_source("benchmark-host");
    proto_entry.set_level(logs::LogLevel::INFO);
    proto_entry.set_environment("production");
    (*proto_entry.mutable_metadata())["key1"] = "value1";
    (*proto_entry.mutable_metadata())["key2"] = "value2";
    proto_entry.set_trace_id("trace-12345-67890");
    proto_entry.set_user_id("user-98765");
    
    std::string proto_data;
    proto_entry.SerializeToString(&proto_data);
    
    std::cout << "=======================================\n";
    std::cout << " Protobuf vs JSON (Current) Benchmark\n";
    std::cout << "=======================================\n";
    std::cout << "Iterations: " << ITERATIONS << "\n\n";
    
    // Size Comparison
    std::cout << "Payload Size:\n";
    std::cout << "  JSON:  " << json_data.size() << " bytes\n";
    std::cout << "  Proto: " << proto_data.size() << " bytes\n";
    std::cout << "  Diff:  " << (1.0 - (double)proto_data.size() / json_data.size()) * 100 << "% reduction\n\n";
    
    // JSON Parsing Benchmark
    auto start = std::chrono::high_resolution_clock::now();
    for(int i=0; i<ITERATIONS; ++i) {
        volatile auto result = parse_json_naive(json_data);
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto json_dur = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
    
    // Protobuf Parsing Benchmark
    start = std::chrono::high_resolution_clock::now();
    for(int i=0; i<ITERATIONS; ++i) {
        logs::LogEntry entry;
        entry.ParseFromString(proto_data);
        volatile auto& ref = entry;
    }
    end = std::chrono::high_resolution_clock::now();
    auto proto_dur = std::chrono::duration_cast<std::chrono::microseconds>(end - start).count();
    
    std::cout << "Parsing Time (" << ITERATIONS << " ops):\n";
    std::cout << "  JSON:  " << json_dur / 1000.0 << " ms (" << (double)ITERATIONS / (json_dur / 1000000.0) << " ops/sec)\n";
    std::cout << "  Proto: " << proto_dur / 1000.0 << " ms (" << (double)ITERATIONS / (proto_dur / 1000000.0) << " ops/sec)\n";
    std::cout << "  Speedup: " << (double)json_dur / proto_dur << "x\n";
    
    return 0;
}
