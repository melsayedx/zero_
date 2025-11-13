#!/bin/bash

# Test script for gRPC API using grpcurl
# Make sure the server is running and grpcurl is installed

echo "╔══════════════════════════════════════════════════════╗"
echo "║   Testing gRPC API - Log Ingestion Platform         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

GRPC_PORT=${GRPC_PORT:-50051}

# Check if grpcurl is installed
if ! command -v grpcurl &> /dev/null; then
    echo "❌ grpcurl not found. Please install it first:"
    echo ""
    echo "  macOS:  brew install grpcurl"
    echo "  Linux:  go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest"
    echo ""
    exit 1
fi

echo "🔍 Testing gRPC server on localhost:${GRPC_PORT}"
echo ""

# Test 1: Health Check
echo "=== Test 1: Health Check ==="
grpcurl -plaintext localhost:${GRPC_PORT} logs.LogService/HealthCheck
echo ""

# Test 2: Ingest Logs
echo "=== Test 2: Ingest Logs ==="
grpcurl -plaintext -d '{
  "logs": [
    {
      "app_id": "test-service",
      "level": "info",
      "message": "Test log from grpcurl",
      "timestamp": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'",
      "metadata": {
        "test": "true",
        "source": "grpcurl"
      }
    },
    {
      "app_id": "test-service",
      "level": "error",
      "message": "Test error log",
      "timestamp": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'",
      "metadata": {
        "error_code": "TEST_001"
      }
    }
  ]
}' localhost:${GRPC_PORT} logs.LogService/IngestLogs
echo ""

# Test 3: Get Logs by App ID
echo "=== Test 3: Get Logs by App ID ==="
grpcurl -plaintext -d '{
  "app_id": "test-service",
  "limit": 10
}' localhost:${GRPC_PORT} logs.LogService/GetLogsByAppId
echo ""

echo "✅ All gRPC tests completed!"
echo ""

