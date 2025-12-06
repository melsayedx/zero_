#!/bin/bash

# Redis Batching Throughput Test Runner
# This script runs the performance test with proper environment setup

echo "🚀 Starting Redis Batching Throughput Test..."
echo ""

# Check if Docker containers are running
echo "📋 Checking Docker containers..."
if ! docker ps | grep -q "log-platform-redis"; then
    echo "❌ Redis container not running. Please start with: docker-compose up -d"
    exit 1
fi

if ! docker ps | grep -q "log-platform-clickhouse"; then
    echo "❌ ClickHouse container not running. Please start with: docker-compose up -d"
    exit 1
fi

echo "✅ Docker containers are running"

# Start the Node.js server
echo ""
echo "🚀 Starting Node.js server..."
npm start &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Check if server is running
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server is healthy"
else
    echo "❌ Server failed to start properly"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🏃 Running throughput test..."
echo ""

# Run the performance test
SKIP_SERVER_CHECK=true node performance-test-redis-batching.js

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
echo "✅ Test completed"
