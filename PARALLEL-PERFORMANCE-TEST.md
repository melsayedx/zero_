# Parallel Performance Testing Guide

## Overview

Run **4 parallel workers** to test extreme load scenarios. Each worker generates **2 million logs**, for a total of **8 MILLION logs** hitting your API simultaneously!

## What This Tests

- **Concurrent load handling** - Multiple clients hitting the API at once
- **Database write concurrency** - ClickHouse handling parallel inserts
- **System resource limits** - CPU, memory, network bandwidth
- **Real-world production scenarios** - Simulates multiple services logging simultaneously

## Quick Start

### 1. Make Sure Your System is Ready

```bash
# Start ClickHouse
docker compose up -d

# Start the application
npm run dev

# Check available resources
docker stats --no-stream
```

### 2. Run the Parallel Test

```bash
node performance-test-parallel.js
```

This will:
- Start 4 worker processes
- Each worker generates 2M logs (8M total)
- All workers run in parallel
- Aggregate results are displayed at the end

## Expected Output

```
╔═══════════════════════════════════════════════════════════╗
║     Parallel Log Ingestion Performance Test              ║
╚═══════════════════════════════════════════════════════════╝

🚀 Test Configuration:
   Parallel Workers: 4
   Logs per Worker: 2,000,000
   Total Logs: 8,000,000

⚠️  WARNING: This will generate MASSIVE load on your system!

Starting in 3 seconds... (Ctrl+C to cancel)

╔═══════════════════════════════════════════════════════════╗
║               Starting Parallel Workers                   ║
╚═══════════════════════════════════════════════════════════╝

🔄 Starting Worker 1...
🔄 Starting Worker 2...
🔄 Starting Worker 3...
🔄 Starting Worker 4...

✅ All 4 workers started!

═══════════════════════════════════════════════════════════
                   WORKER OUTPUT
═══════════════════════════════════════════════════════════

[Worker 1] ╔═══════════════════════════════════════════════╗
[Worker 1] ║   Log Ingestion Performance Test [Worker 1]  ║
[Worker 2] ╔═══════════════════════════════════════════════╗
[Worker 2] ║   Log Ingestion Performance Test [Worker 2]  ║
[... all workers output their progress ...]

✅ [Worker 1] Completed successfully in 85.2s
✅ [Worker 2] Completed successfully in 87.4s
✅ [Worker 3] Completed successfully in 86.8s
✅ [Worker 4] Completed successfully in 88.1s

╔═══════════════════════════════════════════════════════════╗
║              All Workers Completed!                       ║
╚═══════════════════════════════════════════════════════════╝

📊 Aggregate Results:
═══════════════════════════════════════════════════════════
   Total Duration: 88.5s
   Successful Workers: 4/4
   Failed Workers: 0
   Total Logs Processed: 8,000,000
   Aggregate Throughput: 90,395 logs/second
   Average Duration per Worker: 86.9s
   Average Throughput per Worker: 23,014 logs/sec

📈 Individual Worker Performance:
═══════════════════════════════════════════════════════════
   Worker 1:
     ✅ Success
     ⏱️  Duration: 85.2s
     📊 Logs: 2,000,000
     🚀 Throughput: 23,474 logs/sec

   [... similar for Workers 2-4 ...]

🎯 Performance Assessment:
═══════════════════════════════════════════════════════════
   🏆 EXCELLENT! Your system handled extreme load remarkably well!
```

## Performance Benchmarks

Expected throughput based on hardware:

| Hardware | Workers | Total Throughput | Duration (8M logs) |
|----------|---------|-----------------|-------------------|
| MacBook Pro M1 | 4 | 80,000-120,000 logs/sec | 67-100 seconds |
| MacBook Pro M2 | 4 | 100,000-150,000 logs/sec | 53-80 seconds |
| AWS t3.xlarge | 4 | 50,000-80,000 logs/sec | 100-160 seconds |
| High-end Server | 4 | 150,000-250,000 logs/sec | 32-53 seconds |

## Configuration

### Adjust Number of Workers

Edit `performance-test-parallel.js`:

```javascript
const PARALLEL_WORKERS = 8;  // Change from 4 to 8
```

### Adjust Logs per Worker

Edit `performance-test.js`:

```javascript
const TEST_CONFIG = {
  totalLogs: 1000000,  // Change from 2M to 1M
  ...
};
```

### Adjust Batch Size

Edit `performance-test.js`:

```javascript
const TEST_CONFIG = {
  ...
  batchSize: 2000,  // Increase from 1000
  ...
};
```

## Monitoring During Test

### Monitor ClickHouse in Real-Time

```bash
# In a separate terminal
watch -n 1 'docker exec log-platform-clickhouse clickhouse-client --query "SELECT count() FROM logs_db.logs"'
```

### Monitor System Resources

```bash
# CPU, Memory, Network
docker stats log-platform-clickhouse

# Or use htop/top
htop
```

### Monitor Application Logs

```bash
# If running with npm run dev
# Logs will show in that terminal

# Check Docker logs
docker logs -f log-platform-clickhouse
```

## Analyzing Results

After the test completes:

```bash
docker exec -it log-platform-clickhouse clickhouse-client
```

### Total Logs Ingested

```sql
SELECT count() as total_logs FROM logs_db.logs;
```

### Logs per Application

```sql
SELECT app_id, count() as count 
FROM logs_db.logs 
GROUP BY app_id 
ORDER BY count DESC;
```

### Logs per Level

```sql
SELECT level, count() as count 
FROM logs_db.logs 
GROUP BY level 
ORDER BY count DESC;
```

### Ingestion Rate Over Time

```sql
SELECT 
    toStartOfMinute(created_at) as minute,
    count() as logs_per_minute,
    round(count() / 60, 0) as logs_per_second
FROM logs_db.logs 
WHERE created_at > now() - INTERVAL 30 MINUTE
GROUP BY minute 
ORDER BY minute DESC 
LIMIT 20;
```

### Data Size and Compression

```sql
SELECT 
    table,
    formatReadableSize(sum(bytes)) as size,
    sum(rows) as rows,
    round(sum(bytes) / sum(rows), 2) as bytes_per_row
FROM system.parts
WHERE database = 'logs_db' AND table = 'logs' AND active
GROUP BY table;
```

### Partition Information

```sql
SELECT 
    partition,
    count() as parts,
    formatReadableSize(sum(bytes)) as size,
    sum(rows) as rows
FROM system.parts
WHERE database = 'logs_db' AND table = 'logs' AND active
GROUP BY partition
ORDER BY partition DESC
LIMIT 10;
```

## Troubleshooting

### Workers Failing with Timeouts

**Symptoms:**
```
❌ Batch 245 for payment-service failed: Timeout error
```

**Solutions:**

1. **Increase request timeout** in `src/config/database.js`:
```javascript
request_timeout: 120000,  // Increase to 2 minutes
```

2. **Reduce batch size** in `performance-test.js`:
```javascript
batchSize: 500,  // Reduce from 1000
```

3. **Reduce number of workers**:
```javascript
const PARALLEL_WORKERS = 2;  // Reduce from 4
```

### High Memory Usage

**Symptoms:**
```
Error: JavaScript heap out of memory
```

**Solutions:**

1. **Increase Node.js memory**:
```bash
NODE_OPTIONS="--max-old-space-size=8192" node performance-test-parallel.js
```

2. **Reduce logs per worker** in `performance-test.js`:
```javascript
totalLogs: 500000,  // Reduce from 2M
```

3. **Process in smaller chunks** - reduce batch size

### ClickHouse Running Out of Resources

**Symptoms:**
```
Error: DB::Exception: Memory limit exceeded
```

**Solutions:**

1. **Increase ClickHouse memory limit** in `docker-compose.yml`:
```yaml
services:
  clickhouse:
    environment:
      CLICKHOUSE_MAX_MEMORY_USAGE: 8000000000  # 8GB
    deploy:
      resources:
        limits:
          memory: 10g
```

2. **Restart ClickHouse**:
```bash
docker compose down
docker compose up -d
```

3. **Optimize table** after test:
```sql
OPTIMIZE TABLE logs_db.logs FINAL;
```

### Connection Refused Errors

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solutions:**

1. **Make sure application is running**:
```bash
npm run dev
```

2. **Check if port is in use**:
```bash
lsof -i :3000
```

3. **Verify health endpoint**:
```bash
curl http://localhost:3000/health
```

### Workers Complete but with Low Throughput

**Symptoms:**
- All workers succeed
- But throughput < 10,000 logs/sec

**Solutions:**

1. **Check ClickHouse is not throttling**:
```bash
docker logs log-platform-clickhouse | grep -i error
```

2. **Check system resources**:
```bash
# CPU usage
top

# Disk I/O
iostat -x 1

# Network
iftop
```

3. **Optimize ClickHouse settings** - add to `docker-compose.yml`:
```yaml
services:
  clickhouse:
    volumes:
      - ./clickhouse-config.xml:/etc/clickhouse-server/config.d/custom.xml
```

Create `clickhouse-config.xml`:
```xml
<clickhouse>
    <max_concurrent_queries>100</max_concurrent_queries>
    <max_threads>8</max_threads>
</clickhouse>
```

## Cleanup After Testing

### Remove Test Data

```sql
-- Careful! This deletes all data
TRUNCATE TABLE logs_db.logs;

-- Or delete only test data from specific apps
DELETE FROM logs_db.logs 
WHERE app_id IN ('payment-service', 'auth-service', 'api-gateway', 'notification-service');
```

### Optimize Table

```sql
OPTIMIZE TABLE logs_db.logs FINAL;
```

### Reset Docker

```bash
docker compose down -v
docker compose up -d
```

## Advanced Scenarios

### Test with Different App Distributions

Edit `performance-test.js`:

```javascript
applications: [
  { id: 'high-volume-app', weight: 0.70 },  // 70% of logs
  { id: 'medium-app', weight: 0.20 },       // 20% of logs
  { id: 'low-app', weight: 0.10 }           // 10% of logs
]
```

### Test Error Scenarios

Add error injection in `performance-test.js`:

```javascript
function generateLogEntry(appId) {
  // Randomly inject errors
  if (Math.random() < 0.1) {  // 10% error rate
    return {
      app_id: appId,
      level: 'error',
      message: 'Simulated error for testing',
      source: 'error-injector'
    };
  }
  // ... normal log generation
}
```

### Test with Varying Batch Sizes

Create multiple test configs:

```bash
# Small batches
BATCH_SIZE=100 node performance-test-parallel.js

# Large batches  
BATCH_SIZE=5000 node performance-test-parallel.js
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Test

on: [push]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Start ClickHouse
        run: docker compose up -d
      
      - name: Install dependencies
        run: npm install
      
      - name: Start application
        run: npm start &
      
      - name: Wait for services
        run: sleep 10
      
      - name: Run performance test
        run: node performance-test.js  # Single worker for CI
      
      - name: Check results
        run: |
          docker exec log-platform-clickhouse clickhouse-client \
            --query "SELECT count() FROM logs_db.logs"
```

## Best Practices

1. **Start small**: Begin with 2 workers and 500k logs
2. **Monitor resources**: Keep an eye on CPU, memory, and disk
3. **Baseline first**: Run single worker test before parallel
4. **Clean between runs**: Truncate data or use fresh DB
5. **Document results**: Save performance metrics for comparison
6. **Test incrementally**: Gradually increase load to find limits

## When to Use Parallel Testing

✅ **Use parallel testing when:**
- Testing production capacity limits
- Simulating real multi-client scenarios
- Load testing for capacity planning
- Stress testing infrastructure

❌ **Don't use parallel testing when:**
- Just verifying functionality (use single worker)
- Running on limited resources
- Debugging specific issues (too much concurrent output)
- Running in CI/CD (too resource intensive)

## Support

For issues:
1. Check logs: `docker logs log-platform-clickhouse`
2. Check application output
3. Monitor system resources
4. Review `PERFORMANCE-TEST.md` for single-worker testing
5. Review `ARCHITECTURE.md` for system design

Happy load testing! 🚀

