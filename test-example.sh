#!/bin/bash

# Simple test script to verify the log ingestion platform is working

echo "🧪 Testing Log Ingestion Platform..."
echo ""

# Check if server is running
echo "1. Health Check..."
HEALTH=$(curl -s http://localhost:3000/health)
if echo "$HEALTH" | grep -q '"success":true'; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed - is the server running?"
    exit 1
fi

echo ""
echo "2. Ingesting test log (INFO)..."
curl -s -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "info",
    "message": "Test log entry from test script",
    "source": "test-script",
    "metadata": {
      "test": true,
      "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
    }
  }' | jq '.'

echo ""
echo "3. Ingesting test log (ERROR)..."
curl -s -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "error",
    "message": "Test error log with tracing",
    "source": "test-script",
    "metadata": {
      "error_code": "TEST_001",
      "stack": "simulated stack trace"
    },
    "trace_id": "test-trace-123",
    "user_id": "test-user-456"
  }' | jq '.'

echo ""
echo "4. Testing validation (invalid level - should fail)..."
curl -s -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "invalid_level",
    "message": "This should fail",
    "source": "test-script"
  }' | jq '.'

echo ""
echo "✅ All tests completed!"
echo ""
echo "To view logs in ClickHouse, run:"
echo "  docker exec -it log-platform-clickhouse clickhouse-client"
echo "  SELECT * FROM logs_db.logs ORDER BY timestamp DESC LIMIT 10;"

