#!/bin/bash
set -e

COUNT=${1:-100000}
mkdir -p benchmark_results

echo "============================================"
echo " Starting Benchmark (Count: $COUNT)"
echo "============================================"

# 1. Populate
echo -e "\n[1/3] Populating Redis..."
node benchmark/populate_logs.js $COUNT

# 2. Node.js
echo -e "\n[2/3] Running Node.js Benchmark..."
# Truncate is handled inside run_node.js but let's be safe
# node benchmark/run_node.js handles truncation itself.

node benchmark/run_node.js $COUNT &
NODE_PID=$!
echo "Node PID: $NODE_PID"

./benchmark/monitor_pid.sh $NODE_PID benchmark_results/node_stats.csv &
MONITOR_PID=$!

wait $NODE_PID
kill $MONITOR_PID 2>/dev/null || true

# 3. C++
echo -e "\n[3/3] Running C++ Benchmark..."
# Truncate first
node benchmark/truncate.js
# Repopulate for C++
echo "Repopulating for C++..."
node benchmark/populate_logs.js $COUNT

./cpp-ingester/build/clickhouse_ingester --benchmark --count $COUNT &
CPP_PID=$!
echo "C++ PID: $CPP_PID"

./benchmark/monitor_pid.sh $CPP_PID benchmark_results/cpp_stats.csv &
MONITOR_PID=$!

wait $CPP_PID
kill $MONITOR_PID 2>/dev/null || true

echo -e "\n============================================"
echo " Benchmark Complete!"
echo " Results in benchmark_results/"
echo "============================================"
