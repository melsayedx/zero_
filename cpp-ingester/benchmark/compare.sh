#!/bin/bash
# Benchmark comparison: Node.js vs C++ ingester
#
# Usage: ./compare.sh [count]
# Default count: 50000 logs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CPP_BUILD_DIR="$SCRIPT_DIR/../build"
COUNT="${1:-50000}"

echo "============================================="
echo " ClickHouse Ingester Benchmark Comparison"
echo "============================================="
echo "Count: $COUNT logs"
echo ""

# Check if services are running
echo "Checking Redis and ClickHouse..."
redis-cli PING > /dev/null 2>&1 || { echo "Redis not running!"; exit 1; }
curl -s "http://localhost:8123/ping" > /dev/null 2>&1 || { echo "ClickHouse not running!"; exit 1; }
echo "Services OK"
echo ""

# Clean up test data
echo "Cleaning up previous benchmark data..."
redis-cli DEL "benchmark:cpp:stream" > /dev/null 2>&1 || true
curl -s "http://localhost:8123/?query=ALTER+TABLE+logs_db.logs+DELETE+WHERE+app_id='benchmark-cpp'" > /dev/null 2>&1 || true
sleep 1

# Generate test data in Redis
echo "Generating $COUNT test logs in Redis..."
for i in $(seq 1 100); do
    BATCH=""
    for j in $(seq 1 $((COUNT / 100))); do
        IDX=$((( i - 1 ) * COUNT / 100 + j))
        BATCH="$BATCH XADD benchmark:cpp:stream '*' data '{\"appId\":\"benchmark-cpp\",\"message\":\"Test log $IDX\",\"level\":\"INFO\",\"source\":\"benchmark\",\"environment\":\"test\",\"metadataString\":\"{}\"}'"
    done
    eval "redis-cli $BATCH" > /dev/null 2>&1
    printf "."
done
echo ""
echo "Test data generated"
echo ""

# Build C++ ingester if needed
if [ ! -f "$CPP_BUILD_DIR/clickhouse_ingester" ]; then
    echo "Building C++ ingester..."
    mkdir -p "$CPP_BUILD_DIR"
    cd "$CPP_BUILD_DIR"
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(sysctl -n hw.ncpu 2>/dev/null || nproc)
    cd "$SCRIPT_DIR"
fi

# Create consumer group
redis-cli XGROUP CREATE benchmark:cpp:stream benchmark-cpp-group 0 MKSTREAM 2>/dev/null || true

echo ""
echo "============================================="
echo " Running C++ Ingester"
echo "============================================="

STREAM_KEY="benchmark:cpp:stream" \
GROUP_NAME="benchmark-cpp-group" \
"$CPP_BUILD_DIR/clickhouse_ingester" --benchmark --count "$COUNT" --threads 4

echo ""
echo "============================================="
echo " Comparison Complete"
echo "============================================="
echo ""
echo "To compare with Node.js, run:"
echo "  cd $PROJECT_ROOT && npm run benchmark:workers"
echo ""
echo "Then compare the throughput numbers."
