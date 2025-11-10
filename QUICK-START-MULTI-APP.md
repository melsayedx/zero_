# Quick Start: Multi-Application Log Ingestion

## 🎉 What's New

Your log ingestion platform now supports **multiple applications** with optimized batch processing!

### New Features
✅ **Multi-Application Support** - Track logs from different apps via `app_id`
✅ **Batch API Endpoint** - High-throughput batch ingestion
✅ **Partitioned Storage** - Logs partitioned by app and month for faster queries
✅ **Performance Testing** - Load test with 300k logs from 4 apps

## 🚀 Getting Started

### 1. Start the Application

```bash
# Make sure ClickHouse is running
docker compose up -d

# Start the application
npm run dev
```

You should see:
```
Available endpoints:
  GET  /health             - Health check
  POST /api/logs           - Ingest single log entry
  POST /api/logs/batch     - Ingest multiple logs (high-throughput)
```

### 2. Test Single Log Ingestion (New Format)

Now you **must** include `app_id`:

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "my-app",
    "level": "info",
    "message": "User logged in successfully",
    "source": "auth-service",
    "metadata": {
      "user_id": "12345",
      "ip": "192.168.1.1"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Log entry ingested successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "app_id": "my-app",
    "timestamp": "2025-11-10T07:30:00.000Z",
    "level": "info",
    "message": "User logged in successfully",
    "source": "auth-service",
    ...
  }
}
```

### 3. Test Batch Ingestion

Send multiple logs at once:

```bash
curl -X POST http://localhost:3000/api/logs/batch \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "app_id": "payment-service",
        "level": "info",
        "message": "Payment processed",
        "source": "payment-processor"
      },
      {
        "app_id": "payment-service",
        "level": "error",
        "message": "Payment failed",
        "source": "payment-processor"
      },
      {
        "app_id": "auth-service",
        "level": "warn",
        "message": "Failed login attempt",
        "source": "login-handler"
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Batch ingested successfully: 3 logs inserted",
  "data": {
    "inserted": 3,
    "app_ids": ["payment-service", "auth-service"],
    "failed_validations": 0
  }
}
```

### 4. Run Performance Test

Test with 300,000 logs from 4 different applications:

```bash
node performance-test.js
```

This will:
- Generate 90k logs for `payment-service`
- Generate 75k logs for `auth-service`
- Generate 75k logs for `api-gateway`
- Generate 60k logs for `notification-service`

Expected output:
```
╔═══════════════════════════════════════════════════════════╗
║        Log Ingestion Performance Test                    ║
╚═══════════════════════════════════════════════════════════╝

📊 Test Configuration:
   Total Logs: 300,000
   Applications: 4
   Batch Size: 1,000

🚀 Starting parallel log generation...
[... progress bars ...]

📈 Summary:
   Total Duration: 12.5s
   Successful: 300,000 logs
   Overall Throughput: 24,000 logs/second
   Success Rate: 100.00%
```

## 📊 Query Your Multi-App Logs

```bash
# Enter ClickHouse
docker exec -it log-platform-clickhouse clickhouse-client

# Count logs per application
SELECT app_id, count() as total 
FROM logs_db.logs 
GROUP BY app_id 
ORDER BY total DESC;

# Get errors by application
SELECT app_id, count() as errors
FROM logs_db.logs 
WHERE level = 'error'
GROUP BY app_id
ORDER BY errors DESC;

# Get recent logs for specific app
SELECT timestamp, level, message
FROM logs_db.logs
WHERE app_id = 'payment-service'
ORDER BY timestamp DESC
LIMIT 10;

# Time-series analysis
SELECT 
    toStartOfHour(timestamp) as hour,
    app_id,
    count() as log_count
FROM logs_db.logs
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY hour, app_id
ORDER BY hour DESC, app_id;
```

## 🎯 Real-World Examples

### Example 1: E-commerce Platform

```javascript
// Payment service logs
{
  "app_id": "payment-service",
  "level": "info",
  "message": "Payment processed successfully",
  "source": "stripe-integration",
  "metadata": {
    "amount": 99.99,
    "currency": "USD",
    "customer_id": "cus_123"
  },
  "trace_id": "payment-abc-123"
}

// Order service logs
{
  "app_id": "order-service",
  "level": "info",
  "message": "Order created",
  "source": "order-handler",
  "metadata": {
    "order_id": "ord_456",
    "items": 3
  },
  "trace_id": "payment-abc-123"  // Same trace_id!
}

// Notification service logs
{
  "app_id": "notification-service",
  "level": "info",
  "message": "Order confirmation sent",
  "source": "email-sender",
  "metadata": {
    "recipient": "user@example.com",
    "template": "order-confirmation"
  },
  "trace_id": "payment-abc-123"  // Track entire flow!
}
```

### Example 2: Microservices Architecture

```bash
# Batch send logs from different services
curl -X POST http://localhost:3000/api/logs/batch \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {"app_id": "api-gateway", "level": "info", "message": "Request received", "source": "nginx"},
      {"app_id": "auth-service", "level": "info", "message": "Token validated", "source": "jwt-validator"},
      {"app_id": "user-service", "level": "info", "message": "User data fetched", "source": "db-handler"},
      {"app_id": "api-gateway", "level": "info", "message": "Response sent", "source": "nginx"}
    ]
  }'
```

## 🔧 Configuration

### Batch Size Limits

Edit `/Users/mody/zero_/src/core/use-cases/ingest-logs-batch.use-case.js`:

```javascript
const MAX_BATCH_SIZE = 10000;  // Adjust this value
```

### Performance Tuning

For high-volume scenarios, edit `/Users/mody/zero_/src/config/database.js`:

```javascript
const client = createClient({
  host: process.env.CLICKHOUSE_HOST,
  database: process.env.CLICKHOUSE_DATABASE,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  request_timeout: 60000,  // Increase for large batches
  max_open_connections: 10,  // Add connection pooling
  compression: {
    request: true,
    response: true
  }
});
```

## 📝 Required Fields

All logs now require:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `app_id` | string | **YES** | Application identifier |
| `level` | string | **YES** | Log level (debug, info, warn, error, fatal) |
| `message` | string | **YES** | Log message |
| `source` | string | **YES** | Source component |
| `metadata` | object | No | Additional structured data |
| `trace_id` | string | No | Distributed tracing ID |
| `user_id` | string | No | User identifier |
| `timestamp` | string | No | ISO 8601 timestamp (auto-generated if not provided) |

## 🚨 Breaking Change

**⚠️ `app_id` is now required for all logs!**

Old API calls without `app_id` will fail:

```bash
# ❌ This will fail
curl -X POST http://localhost:3000/api/logs \
  -d '{"level": "info", "message": "test", "source": "app"}'

# ✅ This will succeed
curl -X POST http://localhost:3000/api/logs \
  -d '{"app_id": "my-app", "level": "info", "message": "test", "source": "app"}'
```

## 📚 Additional Resources

- **Performance Testing**: See `PERFORMANCE-TEST.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Migration**: See `migrate-add-app-id.sql` (if you have existing data)

## 🎉 You're Ready!

Your platform now supports:
- ✅ Multiple applications
- ✅ High-throughput batch ingestion
- ✅ Optimized partitioned storage
- ✅ Performance testing with 300k+ logs

Start sending logs from your applications! 🚀

