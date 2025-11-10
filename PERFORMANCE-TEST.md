# Performance Testing Guide

This guide explains how to run the performance test suite for the log ingestion platform.

## Overview

The performance test generates **300,000 logs** from **4 different applications** in parallel to test:
- Database write performance
- API throughput
- Multi-application support
- Batch ingestion efficiency

## Test Configuration

### Applications (with realistic distribution)
- **payment-service**: 30% of logs (90,000 logs)
- **auth-service**: 25% of logs (75,000 logs)
- **api-gateway**: 25% of logs (75,000 logs)
- **notification-service**: 20% of logs (60,000 logs)

### Log Levels (realistic distribution)
- **info**: 50%
- **warn**: 25%
- **error**: 15%
- **debug**: 8%
- **fatal**: 2%

### Performance Parameters
- **Batch Size**: 1,000 logs per request
- **Parallel Workers**: 4 (one per application)
- **Total Requests**: ~300 batch requests
- **Expected Throughput**: 5,000-15,000 logs/second (depends on hardware)

## Prerequisites

1. **ClickHouse must be running**
   ```bash
   docker compose up -d
   ```

2. **Application must be running**
   ```bash
   npm start
   # OR for development
   npm run dev
   ```

3. **Database must have the new schema with app_id**
   - If you have an existing database, run the migration:
   ```bash
   docker exec -it log-platform-clickhouse clickhouse-client < migrate-add-app-id.sql
   ```
   - If fresh install, the schema is already correct

## Running the Test

### Basic Run
```bash
node performance-test.js
```

### With Custom Configuration
```bash
# Change server URL
SERVER_URL=http://localhost:3000 node performance-test.js
```

## Expected Output

```
╔═══════════════════════════════════════════════════════════╗
║        Log Ingestion Performance Test                    ║
╚═══════════════════════════════════════════════════════════╝

📊 Test Configuration:
   Total Logs: 300,000
   Applications: 4
   Batch Size: 1,000
   Server: http://localhost:3000

🏥 Checking server health...
✅ Server is healthy

🚀 Starting parallel log generation...

📝 Generating 90000 logs for payment-service...
📦 Sending 90 batches for payment-service...
  payment-service: 100.0% (90000/90000 logs)
✅ payment-service: 90000 logs sent in 8.45s (10650 logs/sec)

[... similar output for other apps ...]

╔═══════════════════════════════════════════════════════════╗
║                    Test Results                           ║
╚═══════════════════════════════════════════════════════════╝

📈 Summary:
   Total Duration: 12.34s
   Successful: 300,000 logs
   Failed: 0 logs
   Overall Throughput: 24,312 logs/second
   Success Rate: 100.00%

📊 Per Application:
   payment-service:
     - Logs: 90,000
     - Duration: 8.45s
     - Throughput: 10,650 logs/sec
   [... etc ...]

✅ Performance test completed!
```

## Interpreting Results

### Good Performance Indicators
- ✅ **10,000+ logs/second** overall throughput
- ✅ **100% success rate**
- ✅ **< 30 seconds** total duration
- ✅ No connection errors or timeouts

### Performance Bottlenecks to Watch
- ⚠️ **< 5,000 logs/second**: May indicate:
  - ClickHouse configuration issues
  - Network latency
  - Insufficient resources
  
- ⚠️ **Timeout errors**: May indicate:
  - ClickHouse overload
  - Too many concurrent connections
  - Memory issues

- ⚠️ **Validation errors**: Check that:
  - All logs include `app_id`
  - Log format is correct

## Querying Test Results

After the test completes, analyze the data in ClickHouse:

```bash
# Enter ClickHouse
docker exec -it log-platform-clickhouse clickhouse-client

# Count logs per application
SELECT app_id, count() as total_logs 
FROM logs_db.logs 
GROUP BY app_id 
ORDER BY total_logs DESC;

# Count logs per level
SELECT level, count() as total_logs 
FROM logs_db.logs 
GROUP BY level 
ORDER BY total_logs DESC;

# Check performance (newest logs)
SELECT app_id, level, count() as count
FROM logs_db.logs 
WHERE timestamp > now() - INTERVAL 5 MINUTE
GROUP BY app_id, level
ORDER BY app_id, level;

# Get time distribution
SELECT 
    toStartOfMinute(timestamp) as minute,
    app_id,
    count() as logs_per_minute
FROM logs_db.logs
WHERE timestamp > now() - INTERVAL 1 HOUR
GROUP BY minute, app_id
ORDER BY minute DESC, app_id;

# Check metadata
SELECT 
    app_id,
    JSONExtractString(metadata, 'region') as region,
    count() as count
FROM logs_db.logs
GROUP BY app_id, region
ORDER BY app_id, region;
```

## Cleanup Test Data

If you want to remove test data:

```sql
-- Delete logs from specific apps
DELETE FROM logs_db.logs 
WHERE app_id IN ('payment-service', 'auth-service', 'api-gateway', 'notification-service');

-- Or truncate entire table
TRUNCATE TABLE logs_db.logs;
```

## Performance Tuning

### ClickHouse Optimization

If performance is not meeting expectations, try these ClickHouse optimizations:

```sql
-- Optimize the table after bulk inserts
OPTIMIZE TABLE logs_db.logs FINAL;

-- Check table size and compression
SELECT 
    table,
    formatReadableSize(sum(bytes)) as size,
    sum(rows) as rows,
    max(modification_time) as latest_modification
FROM system.parts
WHERE database = 'logs_db' AND table = 'logs'
GROUP BY table;
```

### Application Optimization

1. **Increase batch size** (edit `performance-test.js`):
   ```javascript
   batchSize: 2000,  // Increase from 1000
   ```

2. **Increase parallel workers**:
   ```javascript
   parallelWorkers: 8,  // Increase from 4
   ```

3. **Adjust request timeout** (in `src/config/database.js`):
   ```javascript
   request_timeout: 60000,  // Increase to 60 seconds
   ```

## Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```
**Solution**: Make sure the application is running with `npm start`

### ClickHouse Timeout
```
Error: Timeout error
```
**Solution**: 
- Reduce batch size
- Check ClickHouse is not overloaded
- Increase `request_timeout` in `database.js`

### Memory Issues
```
Error: JavaScript heap out of memory
```
**Solution**: Run with increased memory:
```bash
NODE_OPTIONS="--max-old-space-size=4096" node performance-test.js
```

### Validation Errors
```
Error: app_id is required
```
**Solution**: Make sure you've:
1. Updated the database schema (run migration)
2. Restarted the application
3. Cleared any cached data

## Benchmarking Different Scenarios

### Scenario 1: Single App (Maximum Throughput)
Edit `performance-test.js`:
```javascript
applications: [
  { id: 'test-app', weight: 1.0 }
]
```

### Scenario 2: Many Small Batches
```javascript
batchSize: 100,
totalLogs: 100000
```

### Scenario 3: Fewer Large Batches
```javascript
batchSize: 5000,
totalLogs: 500000
```

## Performance Baseline

Expected performance on different hardware:

| Hardware | Throughput | Duration (300k logs) |
|----------|-----------|---------------------|
| MacBook Pro M1 | 20,000-30,000 logs/sec | 10-15 seconds |
| AWS t3.medium | 8,000-12,000 logs/sec | 25-37 seconds |
| AWS t3.large | 15,000-20,000 logs/sec | 15-20 seconds |
| High-end Desktop | 30,000-50,000 logs/sec | 6-10 seconds |

*Note: These are approximate values and can vary based on configuration*

## Next Steps

1. **Monitor in Production**: Use these patterns for production monitoring
2. **Set up Alerts**: Create alerts for throughput drops
3. **Capacity Planning**: Use these metrics to plan infrastructure scaling
4. **Optimize Queries**: Test query performance with the generated data

## Support

If you encounter issues:
1. Check the application logs
2. Check ClickHouse logs: `docker logs log-platform-clickhouse`
3. Verify schema matches expectations
4. Review the ARCHITECTURE.md for system design

