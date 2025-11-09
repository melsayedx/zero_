# Log Ingestion Platform

A minimal, production-ready log ingestion platform built with clean hexagonal architecture. Designed for simplicity and extensibility.

## Features

- ✅ **Clean Architecture**: Hexagonal (Ports & Adapters) design
- ✅ **Fast Storage**: ClickHouse for high-performance time-series data
- ✅ **Simple API**: Single REST endpoint for log ingestion
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

### Ingest Log Entry

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "error",
    "message": "Database connection failed",
    "source": "api-service",
    "metadata": {
      "environment": "production",
      "region": "us-east-1"
    },
    "trace_id": "abc-123-def-456",
    "user_id": "user-789"
  }'
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
│   │   └── repositories/       # clickhouse.repository.js
│   ├── config/                  # database.js, di-container.js
│   └── app.js                   # Express app entry point
├── docker-compose.yml
├── init-clickhouse.sql
├── package.json
└── README.md
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

## Future Enhancements (Not in Phase 1)

- [ ] MongoDB integration for dashboards and metadata
- [ ] Batch processing for high-throughput scenarios
- [ ] Redis caching layer
- [ ] Authentication & authorization
- [ ] Rate limiting
- [ ] Query API for retrieving logs
- [ ] Alert system
- [ ] Schema validation and versioning
- [ ] Performance monitoring

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

