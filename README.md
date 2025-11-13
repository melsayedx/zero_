# Log Ingestion Platform

A minimal, production-ready log ingestion platform built with clean hexagonal architecture. Designed for simplicity and extensibility.

## Features

- ✅ **Clean Architecture**: Hexagonal (Ports & Adapters) design
- ✅ **Fast Storage**: ClickHouse for high-performance time-series data
- ✅ **Simple API**: Single REST endpoint for log ingestion
- ✅ **Protocol Buffer Support**: Binary format for high-throughput ingestion (40-60% smaller payloads)
- ✅ **Batch Validation**: Optimized validation algorithm (50-140% faster for typical batch sizes)
- ✅ **ClickHouse Batch Buffer**: Intelligent batching reduces ClickHouse operations by 99%
- ✅ **Backward Compatible**: Full JSON support maintained alongside Protocol Buffers
- ✅ **Docker Ready**: Zero-config local development with Docker Compose
- ✅ **Production Ready**: Graceful shutdown, error handling, and health checks

## Architecture

```
src/
├── core/                    # Business Logic (Framework-Independent)
│   ├── entities/           # Domain entities with validation
│   ├── use-cases/          # Business use cases
│   └── ports/              # Interfaces for adapters
├── adapters/               # External Interface Implementations
│   ├── http/              # Express REST API
│   └── repositories/      # Database implementations
└── config/                 # Configuration & DI
```

### Architecture Principles

- **Core Layer**: Contains pure business logic with no external dependencies
- **Ports**: Define interfaces that adapters must implement
- **Adapters**: Implement external concerns (HTTP, databases, etc.)
- **Dependency Injection**: Simple manual DI for clean dependency management

## Quick Start

### Prerequisites

- Node.js 18+ 
- Docker & Docker Compose

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file (or copy from `.env.example`):

```env
PORT=3000
NODE_ENV=development

CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=logs_db
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This will start:
- **ClickHouse** on port 8123 (HTTP) and 9000 (native)
- Automatically creates the database and schema

### 4. Start the Application

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Usage

### Supported Content Types

The API supports three ingestion formats:

1. **JSON** (`application/json`) - Human-readable, backward compatible
2. **Protocol Buffer Single** (`application/x-protobuf`) - Binary format for single log entry
3. **Protocol Buffer Batch** (`application/x-protobuf-batch`) - Binary format for batch ingestion

📖 **For detailed Protocol Buffer usage, see [PROTOBUF_GUIDE.md](PROTOBUF_GUIDE.md)**

### Health Check

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "success": true,
  "message": "Service is healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Ingest Log Entry (JSON Format)

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '[{
    "app_id": "my-app",
    "level": "error",
    "message": "Database connection failed",
    "source": "api-service",
    "environment": "production",
    "metadata": {
      "region": "us-east-1"
    },
    "trace_id": "abc-123-def-456",
    "user_id": "user-789"
  }]'
```

### Ingest Log Entry (Protocol Buffer Format)

For high-performance ingestion, use Protocol Buffer format:

```javascript
// See PROTOBUF_GUIDE.md for complete examples
const protobuf = require('protobufjs');
const root = await protobuf.load('proto/log-entry.proto');
const LogEntry = root.lookupType('logs.LogEntry');

const message = LogEntry.create({
  appId: 'my-app',
  level: 3, // ERROR
  message: 'Database connection failed',
  source: 'api-service'
});

const buffer = LogEntry.encode(message).finish();
// Send buffer with Content-Type: application/x-protobuf
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Log entry ingested successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00.123Z",
    "level": "error",
    "message": "Database connection failed",
    "source": "api-service",
    "metadata": {
      "environment": "production",
      "region": "us-east-1"
    },
    "trace_id": "abc-123-def-456",
    "user_id": "user-789"
  }
}
```

**Response (Validation Error):**
```json
{
  "success": false,
  "message": "Failed to ingest log entry",
  "error": "Level must be one of: debug, info, warn, error, fatal"
}
```

## Log Entry Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `level` | string | Yes | Log level: debug, info, warn, error, fatal |
| `message` | string | Yes | Log message |
| `source` | string | Yes | Source/service name |
| `metadata` | object | No | Additional structured data |
| `trace_id` | string | No | Distributed tracing ID |
| `user_id` | string | No | User identifier |
| `timestamp` | string | No | ISO 8601 timestamp (auto-generated if not provided) |

## Database Schema

ClickHouse table structure (auto-created on startup):

```sql
CREATE TABLE logs (
    id String,
    timestamp DateTime64(3),
    level LowCardinality(String),
    message String,
    source LowCardinality(String),
    metadata String,
    trace_id String,
    user_id String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, level, source)
TTL timestamp + INTERVAL 90 DAY;
```

Features:
- **Partitioned by month** for efficient querying
- **TTL of 90 days** for automatic cleanup
- **LowCardinality** for level and source (better compression)
- **Optimized ordering** for time-series queries

## Querying Logs

Access ClickHouse directly to query logs:

```bash
# Via Docker
docker exec -it log-platform-clickhouse clickhouse-client

# Query examples
SELECT * FROM logs_db.logs ORDER BY timestamp DESC LIMIT 10;
SELECT level, count() FROM logs_db.logs GROUP BY level;
SELECT source, count() FROM logs_db.logs WHERE timestamp > now() - INTERVAL 1 HOUR GROUP BY source;
```

## Testing

### Test Scripts

```bash
# Test JSON format (backward compatibility)
npm run test:json

# Test Protocol Buffer single entry
npm run test:protobuf

# Test Protocol Buffer batch
npm run test:protobuf-batch

# Run all format tests
npm run test:all

# Performance comparison (Protobuf vs JSON)
npm run perf:protobuf

# Batch validation integration test
npm run test:batch-validation

# Batch validation benchmark
npm run benchmark:batch

# ClickHouse batch buffer test
npm run test:batch-buffer

# Before vs After comparison (visual demo)
npm run test:before-after
```

## Development

### Project Structure

```
log-ingestion-platform/
├── src/
│   ├── core/                    # Core business logic
│   │   ├── entities/           # log-entry.js
│   │   ├── use-cases/          # ingest-log.use-case.js
│   │   └── ports/              # log-repository.port.js
│   ├── adapters/
│   │   ├── http/               # routes.js, controllers.js
│   │   │                       # protobuf-parser.js, content-parser.middleware.js
│   │   └── repositories/       # clickhouse.repository.js
│   ├── config/                  # database.js, di-container.js
│   └── app.js                   # Express app entry point
├── proto/
│   └── log-entry.proto          # Protocol Buffer schema
├── test-*.js                    # Test scripts for JSON and Protobuf
├── performance-test-protobuf.js # Performance comparison
├── docker-compose.yml
├── init-clickhouse.sql
├── package.json
├── README.md
└── PROTOBUF_GUIDE.md           # Detailed Protocol Buffer documentation
```

### Adding New Features

The architecture is designed for easy extension:

1. **New Use Case**: Add to `src/core/use-cases/`
2. **New Repository**: Implement port in `src/adapters/repositories/`
3. **New Endpoint**: Add route and controller in `src/adapters/http/`
4. **Wire Dependencies**: Update `src/config/di-container.js`

### Code Principles

- **Domain-Driven**: Business logic in core, isolated from frameworks
- **Dependency Inversion**: Core depends on ports (interfaces), adapters implement them
- **Single Responsibility**: Each class has one clear purpose
- **Easy Testing**: Mock ports for unit tests, swap adapters for integration tests

## Stopping the Platform

```bash
# Stop the Node.js server
Ctrl+C

# Stop Docker containers
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

## Performance

### Protocol Buffer Benefits

Protocol Buffer format provides significant performance improvements:

- **40-60% smaller payloads** compared to JSON
- **Reduced bandwidth usage** for high-throughput scenarios
- **Faster serialization/deserialization** with binary format
- **Better throughput** at high request rates (10%+ improvement)

Run the performance comparison test:

```bash
npm run perf:protobuf
```

### Batch Validation Optimization

Optimized validation algorithm processes batches much faster:

- **50-140% faster** validation for typical batch sizes (100-10K logs)
- **Single-pass validation** instead of individual validation per log
- **Better CPU cache utilization** with sequential memory access
- **Lower resource usage** - more efficient processing

Run the batch validation benchmark:

```bash
npm run benchmark:batch
```

**Performance Results:**

| Batch Size | Throughput Before | Throughput After | Improvement |
|------------|-------------------|------------------|-------------|
| 100 logs | 260K logs/sec | 626K logs/sec | **+140%** |
| 1,000 logs | 901K logs/sec | 1.37M logs/sec | **+53%** |
| 10,000 logs | 1.11M logs/sec | 2.58M logs/sec | **+132%** |

See `BATCH_VALIDATION_OPTIMIZATION.md` for details.

### ClickHouse Batch Buffer

Intelligent buffering system accumulates logs and flushes in large batches:

- **99% reduction** in ClickHouse INSERT operations
- **Configurable thresholds**: Flush at 10K logs OR 1 second
- **Compression enabled** for network efficiency
- **Graceful shutdown** ensures no data loss

**How it works:**
```
100 requests × 100 logs each = 10,000 logs
→ Buffer accumulates all logs
→ Single INSERT to ClickHouse (10K logs at once)
→ 99% fewer operations vs. per-request inserts
```

Run the batch buffer test:

```bash
npm run test:batch-buffer
```

**Configuration:**
```javascript
// Adjust via repository constructor options
maxBatchSize: 10000,  // Flush at 10K logs
maxWaitTime: 1000,    // OR after 1 second
compression: true     // Enable compression
```

**Monitor buffer metrics:**
```bash
GET /api/stats
```

See `CLICKHOUSE_BATCH_OPTIMIZATION.md` for complete documentation.

## Future Enhancements

- [ ] MongoDB integration for dashboards and metadata
- [ ] Compression for protobuf payloads (gzip/brotli)
- [ ] Streaming protobuf for real-time logs
- [ ] Redis caching layer
- [ ] Authentication & authorization
- [ ] Rate limiting
- [ ] Alert system
- [ ] Performance monitoring and metrics

## Troubleshooting

### ClickHouse Connection Failed

```bash
# Check if ClickHouse is running
docker ps

# Check ClickHouse logs
docker logs log-platform-clickhouse

# Verify ClickHouse is accessible
curl http://localhost:8123/ping
```

### Port Already in Use

Change the `PORT` in your `.env` file or stop the conflicting service:

```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 <PID>
```

## License

MIT

## Contributing

This is a minimal platform designed for evolution. Feel free to extend it based on your needs while maintaining the clean architecture principles.

