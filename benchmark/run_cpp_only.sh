#!/bin/bash
set -e
COUNT=${1:-100000}
mkdir -p benchmark_results

echo "============================================"
echo " Starting C++ Only Benchmark (Count: $COUNT)"
echo "============================================"

# Truncate
node benchmark/truncate.js

# Populate
echo -e "\nPopulating Redis..."
redis-cli del logs:stream
node benchmark/populate_logs.js $COUNT

# Run C++
echo -e "\nRunning C++ Benchmark..."
./cpp-ingester/build/clickhouse_ingester --benchmark --count $COUNT --threads 1 &
CPP_PID=$!
echo "C++ PID: $CPP_PID"

./benchmark/monitor_pid.sh $CPP_PID benchmark_results/cpp_stats.csv &
MONITOR_PID=$!

wait $CPP_PID
kill $MONITOR_PID 2>/dev/null || true

echo -e "\nDone!"
