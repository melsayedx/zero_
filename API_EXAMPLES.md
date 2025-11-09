# API Examples

Quick reference guide with curl examples for the Log Ingestion Platform API.

## Authentication

### Get API Key

First, create a user and generate an API key:

```bash
# Using MongoDB script or through API
node -e "
const User = require('./src/models/mongodb/user.model');
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/observability_platform').then(async () => {
  const user = await User.findOne({ username: 'admin' });
  const apiKey = user.generateApiKey('Production API Key');
  await user.save();
  console.log('API Key:', apiKey);
  process.exit(0);
});
"
```

## Log Ingestion

### Single Log

```bash
curl -X POST http://localhost:3000/api/v1/ingest \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-01T12:00:00.000Z",
    "level": "INFO",
    "message": "User logged in successfully",
    "service": "auth-service",
    "metadata": {
      "userId": "user123",
      "ip": "192.168.1.1"
    },
    "source": {
      "host": "auth-server-01",
      "environment": "production"
    }
  }'
```

### Batch Ingestion

```bash
curl -X POST http://localhost:3000/api/v1/ingest/batch \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "level": "INFO",
        "message": "Request received",
        "service": "api-gateway"
      },
      {
        "level": "ERROR",
        "message": "Database timeout",
        "service": "api-gateway"
      }
    ]
  }'
```

### Ingestion with Schema Detection

```bash
curl -X POST http://localhost:3000/api/v1/ingest/with-schema \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "payment-service",
    "logs": [
      {
        "level": "INFO",
        "message": "Payment processed",
        "amount": 99.99,
        "currency": "USD"
      }
    ]
  }'
```

## Querying Logs

### Basic Query

```bash
curl -X POST http://localhost:3000/api/v1/query/logs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-02T00:00:00.000Z"
    },
    "limit": 100
  }'
```

### Query with Filters

```bash
curl -X POST http://localhost:3000/api/v1/query/logs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-02T00:00:00.000Z"
    },
    "service": "api-gateway",
    "level": "ERROR",
    "search": "timeout",
    "limit": 50
  }'
```

### Logs by Level

```bash
curl -X POST http://localhost:3000/api/v1/query/by-level \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-02T00:00:00.000Z"
    }
  }'
```

### Logs by Service

```bash
curl -X POST http://localhost:3000/api/v1/query/by-service \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-02T00:00:00.000Z"
    }
  }'
```

### Time Series Data

```bash
curl -X POST http://localhost:3000/api/v1/query/timeseries \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-01T06:00:00.000Z"
    },
    "interval": "5 minute",
    "service": "api-gateway"
  }'
```

### Top Errors

```bash
curl -X POST http://localhost:3000/api/v1/query/errors/top \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeRange": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-02T00:00:00.000Z"
    },
    "limit": 10
  }'
```

### Trace Lookup

```bash
curl -X GET "http://localhost:3000/api/v1/query/trace/abc123xyz" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Dashboard Management

### List Dashboards

```bash
curl -X GET http://localhost:3000/api/v1/dashboards \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create Dashboard

```bash
curl -X POST http://localhost:3000/api/v1/dashboards \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Overview",
    "description": "Main production dashboard",
    "timeRange": "24h",
    "widgets": [
      {
        "id": "widget1",
        "type": "chart",
        "title": "Error Rate",
        "query": {
          "timeRange": { "start": "", "end": "" },
          "level": "ERROR"
        },
        "visualization": {
          "chartType": "line"
        },
        "position": { "x": 0, "y": 0, "width": 6, "height": 4 }
      }
    ]
  }'
```

### Get Dashboard

```bash
curl -X GET http://localhost:3000/api/v1/dashboards/DASHBOARD_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Dashboard

```bash
curl -X PUT http://localhost:3000/api/v1/dashboards/DASHBOARD_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Dashboard Name"
  }'
```

## Schema Registry

### Register Schema

```bash
curl -X POST http://localhost:3000/api/v1/schemas/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api_logs_v1",
    "version": "1.0.0",
    "description": "API gateway logs schema",
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
      },
      {
        "name": "message",
        "type": "string",
        "required": true
      },
      {
        "name": "statusCode",
        "type": "number",
        "required": false
      }
    ],
    "services": ["api-gateway"],
    "validation": {
      "strict": false,
      "allowAdditionalFields": true
    }
  }'
```

### List Schemas

```bash
curl -X GET http://localhost:3000/api/v1/schemas \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Validate Log Against Schema

```bash
curl -X POST http://localhost:3000/api/v1/schemas/api_logs_v1/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "log": {
      "timestamp": "2024-01-01T12:00:00.000Z",
      "level": "INFO",
      "message": "Request processed",
      "statusCode": 200
    }
  }'
```

## System Management

### Health Check

```bash
curl -X GET http://localhost:3000/health
```

### Metrics

```bash
curl -X GET http://localhost:3000/metrics
```

### Ingestion Stats

```bash
curl -X GET http://localhost:3000/api/v1/ingest/stats \
  -H "x-api-key: YOUR_API_KEY"
```

### Force Flush

```bash
curl -X POST http://localhost:3000/api/v1/ingest/flush \
  -H "x-api-key: YOUR_API_KEY"
```

### Clear Cache

```bash
curl -X DELETE http://localhost:3000/api/v1/query/cache \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## JavaScript Examples

### Node.js Client

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
});

// Ingest log
async function ingestLog(log) {
  try {
    const response = await client.post('/api/v1/ingest', log);
    console.log('Log ingested:', response.data);
  } catch (error) {
    console.error('Ingestion failed:', error.message);
  }
}

// Query logs
async function queryLogs(filters) {
  try {
    const response = await client.post('/api/v1/query/logs', filters, {
      headers: {
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
      }
    });
    console.log('Query results:', response.data);
  } catch (error) {
    console.error('Query failed:', error.message);
  }
}

// Usage
ingestLog({
  level: 'INFO',
  message: 'Application started',
  service: 'my-app'
});

queryLogs({
  timeRange: {
    start: new Date(Date.now() - 3600000).toISOString(),
    end: new Date().toISOString()
  },
  limit: 100
});
```

## Python Example

```python
import requests
import json
from datetime import datetime, timedelta

API_URL = 'http://localhost:3000'
API_KEY = 'YOUR_API_KEY'

def ingest_log(log):
    response = requests.post(
        f'{API_URL}/api/v1/ingest',
        headers={'x-api-key': API_KEY},
        json=log
    )
    return response.json()

def query_logs(filters):
    response = requests.post(
        f'{API_URL}/api/v1/query/logs',
        headers={'Authorization': f'Bearer YOUR_JWT_TOKEN'},
        json=filters
    )
    return response.json()

# Usage
log = {
    'level': 'INFO',
    'message': 'User action completed',
    'service': 'web-app',
    'metadata': {
        'userId': 'user123',
        'action': 'purchase'
    }
}

result = ingest_log(log)
print(f'Ingested: {result}')

# Query last hour
end_time = datetime.utcnow()
start_time = end_time - timedelta(hours=1)

logs = query_logs({
    'timeRange': {
        'start': start_time.isoformat() + 'Z',
        'end': end_time.isoformat() + 'Z'
    },
    'service': 'web-app',
    'limit': 100
})

print(f'Found {logs["count"]} logs')
```

## Response Examples

### Successful Ingestion

```json
{
  "status": "accepted",
  "count": 1
}
```

### Query Results

```json
{
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00.000Z",
      "level": "ERROR",
      "message": "Database connection timeout",
      "service": "api-gateway",
      "metadata": {
        "database": "users_db",
        "timeout": "30s"
      },
      "host": "api-server-01",
      "environment": "production"
    }
  ],
  "count": 1,
  "limit": 100,
  "offset": 0,
  "cached": false,
  "queryTime": 45
}
```

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "services": {
    "clickhouse": "up",
    "mongodb": "up",
    "redis": "up"
  },
  "system": {
    "healthy": true,
    "issues": [],
    "metrics": {
      "uptime": 86400,
      "requests": {
        "total": 10000,
        "successRate": "99.5%",
        "avgDuration": 45
      },
      "memory": {
        "rss": 256,
        "heapUsed": 128
      }
    }
  }
}
```

