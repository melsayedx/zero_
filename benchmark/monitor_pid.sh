#!/bin/bash
# monitor_pid.sh [PID] [OUTPUT_FILE]
PID=$1
OUT=$2

echo "Timestamp,CPU_Percent,Memory_KB" > $OUT

while ps -p $PID > /dev/null; do
    # Get CPU and RSS (Resident Set Size - Memory)
    # ps -o %cpu,rss -p $PID | tail -n 1
    STATS=$(ps -p $PID -o %cpu,rss | tail -n 1)
    TS=$(date +%s%N)
    
    # Format: Timestamp, CPU, RAM
    # Use awk to format comma separated
    echo "$STATS" | awk -v ts="$TS" '{print ts "," $1 "," $2}' >> $OUT
    
    sleep 0.5
done
