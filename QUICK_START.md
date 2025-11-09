# Quick Start Guide

Get up and running with the Log Ingestion Platform in 5 minutes.

## Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start Databases

```bash
cd docker
docker-compose up -d
cd ..
```

This starts:
- ClickHouse on port 8123
- MongoDB on port 27017
- Redis on port 6379

Wait 30 seconds for databases to initialize.

## Step 3: Setup Databases

```bash
npm run setup:clickhouse
npm run setup:mongodb
```

This creates:
- ClickHouse tables and views
- MongoDB collections and indexes
- Default admin user (username: `admin`, password: `admin123`)

## Step 4: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

The defaults work for local development. For production, update the values.

## Step 5: Start the Application

```bash
npm run dev
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        Log Ingestion Platform - v1.0.0                     ║
║                                                            ║
║  Server running on: http://localhost:3000                  ║
║  ...                                                       ║
╚════════════════════════════════════════════════════════════╝
```

## Step 6: Verify Installation

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "clickhouse": "up",
    "mongodb": "up",
    "redis": "up"
  }
}
```

## Step 7: Generate API Key

Create an API key for ingesting logs:

```bash
node -e "
const mongoose = require('mongoose');
const User = require('./src/models/mongodb/user.model');

mongoose.connect('mongodb://localhost:27017/observability_platform').then(async () => {
  const user = await User.findOne({ username: 'admin' });
  const apiKey = user.generateApiKey('Dev API Key');
  await user.save();
  console.log('API Key:', apiKey);
  process.exit(0);
});
"
```

Copy the generated API key.

## Step 8: Ingest Your First Log

Replace `YOUR_API_KEY` with the key from Step 7:

```bash
curl -X POST http://localhost:3000/api/v1/ingest \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "INFO",
    "message": "My first log!",
    "service": "test-app",
    "metadata": {
      "version": "1.0.0"
    }
  }'
```

Expected response:
```json
{
  "status": "accepted",
  "count": 1
}
```

## Step 9: Query Your Logs

Get logs from the last hour:

```bash
curl -X POST http://localhost:3000/api/v1/query/logs \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"timeRange\": {
      \"start\": \"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)\",
      \"end\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    },
    \"limit\": 10
  }"
```

## Next Steps

### Ingest Sample Data

Run the performance benchmark to generate sample data:

```bash
npm run test:performance
```

This ingests 10,000 sample logs.

### Explore the API

See [API_EXAMPLES.md](./API_EXAMPLES.md) for more examples.

### Create a Dashboard

```bash
curl -X POST http://localhost:3000/api/v1/dashboards \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Dashboard",
    "description": "Testing the platform",
    "timeRange": "24h"
  }'
```

### Monitor Performance

View real-time metrics:

```bash
curl http://localhost:3000/metrics
```

## Common Commands

```bash
# Start in development mode (with auto-reload)
npm run dev

# Start in production mode
npm start

# Run tests
npm test

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down

# Reset everything (WARNING: Deletes all data)
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

Change the port in `.env`:

```bash
PORT=3001
```

### Database Connection Failed

Make sure Docker containers are running:

```bash
docker-compose ps
```

All services should be "Up".

### ClickHouse Setup Failed

Check ClickHouse logs:

```bash
docker-compose logs clickhouse
```

### High Memory Usage

Reduce batch size in `.env`:

```bash
BATCH_SIZE=5000
```

## Production Deployment

For production deployment:

1. Update `.env` with production credentials
2. Change default admin password
3. Enable HTTPS
4. Set up proper monitoring
5. Configure log retention in ClickHouse
6. Set up database backups

See [README.md](./README.md) for detailed production setup.

## Architecture Overview

```
Your App → API Key → Express.js → Batch Processor → ClickHouse
                         ↓
                      MongoDB (Dashboards/Schemas)
                         ↓
                      Redis (Cache)
```

## Performance Characteristics

Out of the box, the platform can handle:

- **Ingestion**: 50,000+ logs/second (batch mode)
- **Query**: Sub-100ms for most queries
- **Storage**: Billions of logs (ClickHouse scales horizontally)
- **Retention**: Configurable (default: unlimited)

## What's Next?

- Read the full [README.md](./README.md)
- Check out [API_EXAMPLES.md](./API_EXAMPLES.md)
- Join the community
- Star the repo!

---

**Need help?** Open an issue on GitHub.

