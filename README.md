# Log Ingestion Platform

A high-performance observability platform built with Express.js for ingesting, storing, and querying logs at scale.

## 🚀 Features

- **High-throughput log ingestion** - Batch processing with configurable buffer sizes
- **Time-series storage** - ClickHouse optimized for analytical queries
- **Flexible querying** - Rich query API with filtering, aggregation, and full-text search
- **Dashboard management** - Create and manage custom dashboards
- **Schema registry** - Automatic schema detection and validation
- **Caching** - Redis-based query result caching
- **Production-ready** - Compression, monitoring, error handling, and graceful shutdown

## 📋 Architecture

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         Express.js API Layer            │
│  ┌──────────┬──────────┬──────────┐    │
│  │Ingestion │  Query   │Dashboard │    │
│  │  Routes  │  Routes  │ Routes   │    │
│  └──────────┴──────────┴──────────┘    │
└─────────┬───────────────────────────────┘
          │
    ┌─────┴─────┬─────────┬────────┐
    ▼           ▼         ▼        ▼
┌──────────┐ ┌────────┐ ┌────┐ ┌──────┐
│ClickHouse│ │MongoDB │ │Redis│ │Batch │
│  (Logs)  │ │ (Meta) │ │Cache│ │Queue │
└──────────┘ └────────┘ └────┘ └──────┘
```

### Technology Stack

- **Node.js + Express.js** - API framework
- **ClickHouse** - Time-series analytics database for logs
- **MongoDB** - Application state (dashboards, users, schemas)
- **Redis** - Query caching and session management
- **Pino** - High-performance logging
- **Docker** - Containerization

## 🛠️ Installation

### Prerequisites

- Node.js 18+ 
- Docker and Docker Compose (for databases)
- Or manually install: ClickHouse, MongoDB, Redis

### Quick Start with Docker

1. **Clone and install dependencies:**

```bash
git clone <repository>
cd log-ingestion-platform
npm install
```

2. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start databases with Docker Compose:**

```bash
cd docker
docker-compose up -d
```

4. **Initialize databases:**

```bash
npm run setup:clickhouse
npm run setup:mongodb
```

5. **Start the application:**

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Health Check

```bash
GET /health
```

Returns system health status and database connectivity.

### Log Ingestion

#### Ingest Single Log

```bash
POST /api/v1/ingest
Headers: x-api-key: YOUR_API_KEY
Content-Type: application/json

{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "INFO",
  "message": "Application started",
  "service": "api-gateway",
  "metadata": {
    "version": "1.0.0",
    "environment": "production"
  },
  "source": {
    "host": "server-01",
    "environment": "production"
  }
}
```

#### Ingest Batch

```bash
POST /api/v1/ingest/batch
Headers: x-api-key: YOUR_API_KEY

{
  "logs": [
    {
      "level": "INFO",
      "message": "Request received",
      "service": "api"
    },
    {
      "level": "ERROR",
      "message": "Database connection failed",
      "service": "api"
    }
  ]
}
```

### Query Logs

```bash
POST /api/v1/query/logs
Headers: Authorization: Bearer YOUR_JWT_TOKEN

{
  "timeRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-02T00:00:00.000Z"
  },
  "service": "api-gateway",
  "level": "ERROR",
  "search": "database",
  "limit": 100,
  "offset": 0
}
```

### Aggregation Queries

#### Logs by Level

```bash
POST /api/v1/query/by-level
{
  "timeRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-02T00:00:00.000Z"
  }
}
```

#### Logs by Service

```bash
POST /api/v1/query/by-service
{
  "timeRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-02T00:00:00.000Z"
  }
}
```

#### Time Series

```bash
POST /api/v1/query/timeseries
{
  "timeRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-01-02T00:00:00.000Z"
  },
  "interval": "1 minute",
  "service": "api-gateway"
}
```

### Dashboard Management

```bash
# List dashboards
GET /api/v1/dashboards

# Get dashboard
GET /api/v1/dashboards/:id

# Create dashboard
POST /api/v1/dashboards
{
  "name": "System Overview",
  "description": "Main system dashboard",
  "widgets": [],
  "timeRange": "24h"
}

# Update dashboard
PUT /api/v1/dashboards/:id

# Delete dashboard
DELETE /api/v1/dashboards/:id
```

### Schema Registry

```bash
# Register schema
POST /api/v1/schemas/register
{
  "name": "api_logs",
  "version": "1.0.0",
  "fields": [
    {
      "name": "timestamp",
      "type": "date",
      "required": true
    },
    {
      "name": "level",
      "type": "string",
      "required": true
    }
  ],
  "services": ["api-gateway"]
}

# List schemas
GET /api/v1/schemas

# Get schema
GET /api/v1/schemas/:name
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=logs_db
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# MongoDB
MONGODB_URI=mongodb://localhost:27017/observability_platform
MONGODB_POOL_SIZE=10

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Performance
BATCH_SIZE=10000          # Logs per batch
BATCH_TIMEOUT=1000        # Milliseconds
MAX_CONCURRENT_BATCHES=5  # Concurrent batch operations
QUERY_CACHE_TTL=300       # Query cache TTL in seconds

# Security
JWT_SECRET=your-secret-key
JWT_EXPIRATION=24h
```

## 🔧 Performance Tuning

### Batch Processing

The platform uses batch processing for optimal ingestion performance:

- **Buffer Size**: 10,000 logs (configurable)
- **Flush Timeout**: 1 second (configurable)
- **Concurrent Batches**: 5 (configurable)

Adjust `BATCH_SIZE` and `BATCH_TIMEOUT` based on your workload:

```bash
# High throughput (more logs, less frequent flushes)
BATCH_SIZE=50000
BATCH_TIMEOUT=5000

# Low latency (smaller batches, frequent flushes)
BATCH_SIZE=1000
BATCH_TIMEOUT=500
```

### ClickHouse Optimization

The logs table is optimized for time-series queries:

- **Partitioning**: By day (`toYYYYMMDD(timestamp)`)
- **Ordering**: By timestamp, service, level
- **Compression**: LowCardinality for repeated strings
- **Materialized Views**: Pre-aggregated metrics

### Caching Strategy

Query results are cached in Redis:

- **Default TTL**: 5 minutes
- **Cache Key**: Generated from query parameters
- **Invalidation**: Manual or pattern-based

## 📊 Monitoring

### Metrics Endpoint

```bash
GET /metrics
```

Returns performance metrics:

- Request statistics (total, success rate, avg duration)
- Ingestion statistics (logs processed, batches, rate)
- Query statistics (total, cache hit rate, avg duration)
- System metrics (uptime, memory, CPU)

### Performance Monitoring

```bash
# View ingestion stats
GET /api/v1/ingest/stats

# View system metrics
GET /metrics
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run performance benchmarks
npm run test:performance
```

## 🐳 Docker Deployment

### Build and run with Docker Compose:

```bash
cd docker
docker-compose up -d
```

Services:
- API: `http://localhost:3000`
- ClickHouse: `http://localhost:8123`
- MongoDB: `mongodb://localhost:27017`
- Redis: `redis://localhost:6379`

## 🔐 Security

### Authentication

Two authentication methods are supported:

1. **JWT Tokens** - For dashboard and query access
2. **API Keys** - For log ingestion

Generate API key for a user:

```javascript
const user = await User.findById(userId);
const apiKey = user.generateApiKey('My API Key');
await user.save();
```

### Best Practices

- Change default admin password immediately
- Use environment variables for secrets
- Enable HTTPS in production
- Implement rate limiting
- Regular security audits

## 📈 Scaling

### Horizontal Scaling

- Run multiple API instances behind a load balancer
- Use Redis for session sharing
- ClickHouse replication for high availability

### Vertical Scaling

- Increase `BATCH_SIZE` for higher throughput
- Increase `MAX_CONCURRENT_BATCHES` for parallel processing
- Allocate more memory to ClickHouse and MongoDB

## 🐛 Troubleshooting

### High Memory Usage

```bash
# Check batch processor stats
GET /api/v1/ingest/stats

# Reduce batch size
BATCH_SIZE=5000
```

### Slow Queries

```bash
# Clear query cache
DELETE /api/v1/query/cache

# Check ClickHouse query performance
# Analyze slow queries in ClickHouse logs
```

### Database Connection Issues

```bash
# Check health endpoint
GET /health

# Verify database connectivity
docker-compose ps
```

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please read the contributing guidelines before submitting PRs.

## 📧 Support

For issues and questions:
- GitHub Issues
- Documentation
- Community Forum

---

**Built with ❤️ for high-performance observability**

