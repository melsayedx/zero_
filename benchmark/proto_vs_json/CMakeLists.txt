cmake_minimum_required(VERSION 3.14)
project(proto_vs_json VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find Protobuf and Abseil
find_package(absl REQUIRED)
find_package(Protobuf REQUIRED)

add_executable(proto_benchmark
    src/main.cpp
    src/log-entry.pb.cc
)

target_include_directories(proto_benchmark PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${Protobuf_INCLUDE_DIRS}
)

target_link_libraries(proto_benchmark PRIVATE
    protobuf::libprotobuf
    absl::log_internal_check_op
    absl::log_internal_message
    pthread
)
