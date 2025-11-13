#!/bin/bash

# Test All Formats Script
# Runs tests for JSON and Protocol Buffer formats

echo "╔════════════════════════════════════════════════════════╗"
echo "║         Testing All Ingestion Formats                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if server is running
echo "Checking if server is running..."
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ Error: Server is not running on http://localhost:3000"
    echo "Please start the server first: npm start"
    exit 1
fi
echo "✅ Server is running"
echo ""

# Test 1: JSON Format (Backward Compatible)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: JSON Format (Backward Compatible)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node test-json-backward-compatible.js
echo ""
sleep 1

# Test 2: Protocol Buffer Single Entry
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Protocol Buffer Single Entry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node test-protobuf-single.js
echo ""
sleep 1

# Test 3: Protocol Buffer Batch
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: Protocol Buffer Batch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node test-protobuf-batch.js
echo ""

echo "╔════════════════════════════════════════════════════════╗"
echo "║            All Format Tests Completed!                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "To run performance comparison:"
echo "  node performance-test-protobuf.js"

