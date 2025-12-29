cmake_minimum_required(VERSION 3.14)
project(clickhouse_ingester VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Release optimizations
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native -flto")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -flto")
endif()

# ============================================
# Dependencies
# ============================================

# FetchContent for downloading dependencies
include(FetchContent)

# hiredis (Redis client)
find_package(PkgConfig REQUIRED)
pkg_check_modules(HIREDIS REQUIRED hiredis)

# clickhouse-cpp (fetched from GitHub)
FetchContent_Declare(
    clickhouse-cpp
    GIT_REPOSITORY https://github.com/ClickHouse/clickhouse-cpp.git
    GIT_TAG        v2.5.1
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(clickhouse-cpp)

# ============================================
# Main Executable
# ============================================

add_executable(clickhouse_ingester
    src/main.cpp
    src/redis_consumer.cpp
    src/clickhouse_writer.cpp
    src/config.cpp
)

target_include_directories(clickhouse_ingester PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${HIREDIS_INCLUDE_DIRS}
)

target_link_libraries(clickhouse_ingester PRIVATE
    clickhouse-cpp-lib
    ${HIREDIS_LIBRARIES}
    pthread
)

# Link directories for hiredis
target_link_directories(clickhouse_ingester PRIVATE
    ${HIREDIS_LIBRARY_DIRS}
)

# ============================================
# Install
# ============================================

install(TARGETS clickhouse_ingester DESTINATION bin)
