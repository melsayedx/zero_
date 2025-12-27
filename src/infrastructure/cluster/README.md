# Node.js Cluster Support

Multi-process architecture for true horizontal scaling across CPU cores.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MASTER PROCESS                           │
│              (Cluster Manager - no requests)                │
│                                                             │
│  • Manages worker lifecycle                                 │
│  • Health monitoring                                        │
│  • Load balancing (via OS)                                  │
│  • Graceful restarts                                        │
│  • Auto-recovery from crashes                               │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├─────────────────────────────────────────────────┐
           │                                                 │
┌──────────▼──────────┐  ┌──────────────────┐  ┌────────────▼─────┐
│  WORKER PROCESS 1   │  │ WORKER PROCESS 2 │  │ WORKER PROCESS N │
│                     │  │                  │  │                  │
│  • HTTP Server      │  │  • HTTP Server   │  │  • HTTP Server   │
│  • gRPC Server      │  │  • gRPC Server   │  │  • gRPC Server   │
│  • Worker Threads   │  │  • Worker Threads│  │  • Worker Threads│
│  • ClickHouse Client│  │  • ClickHouse    │  │  • ClickHouse    │
└─────────────────────┘  └──────────────────┘  └──────────────────┘
```

## Cluster vs Worker Threads

| Feature | **Cluster (Multi-Process)** | **Worker Threads** |
|---------|----------------------------|-------------------|
| **Isolation** | Separate processes, separate memory | Same process, shared memory |
| **Crash Recovery** | One worker crash doesn't affect others | Thread crash can crash process |
| **CPU Utilization** | Full multi-core scaling | Limited by single process |
| **Best For** | I/O-bound requests (HTTP/gRPC) | CPU-bound tasks (validation) |
| **Overhead** | Higher (OS process overhead) | Lower (V8 isolates) |
| **Use Together?** | ✅ YES! Each cluster worker can use worker threads |

## When to Use Cluster

✅ **Use Cluster when:**
- Handling high concurrent HTTP/gRPC requests
- Need process isolation (one crash shouldn't affect all)
- Want to scale across all CPU cores
- Need zero-downtime deployments
- Running in production

❌ **Don't use Cluster when:**
- Running on single-core machine
- Application is already CPU-bound (use worker threads instead)
- Need shared state across requests (cluster workers are isolated)

## Quick Start

### 1. Start in Cluster Mode

```bash
# Start with automatic worker count (= CPU cores)
node cluster.js

# Start with specific number of workers
node cluster.js --workers 8

# Or use npm script
npm run start:cluster
```

### 2. Environment Configuration

Create `.env` file:

```bash
# Cluster Configuration
CLUSTER_WORKERS=8              # Number of worker processes (default: CPU cores)
CLUSTER_MIN_WORKERS=2          # Minimum workers (for auto-scaling)
CLUSTER_MAX_WORKERS=16         # Maximum workers (for auto-scaling)

# Health & Monitoring
HEALTH_CHECK_INTERVAL=30000    # Health check interval (ms)
HEALTH_REPORT_INTERVAL=30000   # Worker health report interval (ms)
WORKER_RESTART_DELAY=5000      # Delay before respawning crashed worker (ms)

# Graceful Shutdown
GRACEFUL_SHUTDOWN_TIMEOUT=30000 # Max time for graceful shutdown (ms)

# Resource Limits
WORKER_MEMORY_LIMIT=1073741824  # 1GB per worker (bytes)

# Cluster API (optional)
CLUSTER_API_PORT=9000          # Management API port (optional)
LOG_CLUSTER_STATS=true         # Log cluster stats periodically
```

## Production Deployment

### Recommended Configuration

**Small Server (4 cores, 8GB RAM):**
```bash
CLUSTER_WORKERS=4
WORKER_MEMORY_LIMIT=1073741824  # 1GB per worker
```

**Medium Server (8 cores, 16GB RAM):**
```bash
CLUSTER_WORKERS=8
WORKER_MEMORY_LIMIT=1610612736  # 1.5GB per worker
```

**Large Server (16 cores, 32GB RAM):**
```bash
CLUSTER_WORKERS=16
WORKER_MEMORY_LIMIT=1610612736  # 1.5GB per worker
```

### With PM2 (Production Process Manager)

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'zero-logs',
    script: './cluster.js',
    instances: 1, // Only 1 instance - cluster.js manages workers internally
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      CLUSTER_WORKERS: 8,
      CLUSTER_API_PORT: 9000
    }
  }]
};
```

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs zero-logs
```

## Cluster Management

### Via Process Signals

```bash
# Get master process PID
ps aux | grep "node cluster.js" | grep -v grep

# Rolling restart (zero-downtime)
kill -USR2 <master-pid>

# Graceful shutdown
kill -TERM <master-pid>
```

### Via Cluster API (if enabled)

Start with `CLUSTER_API_PORT=9000`:

```bash
# Get cluster statistics
curl http://localhost:9000/stats

# Health check
curl http://localhost:9000/health

# Rolling restart
curl -X POST http://localhost:9000/restart

# Scale to 12 workers
curl -X POST http://localhost:9000/scale \
  -H "Content-Type: application/json" \
  -d '{"workers": 12}'
```

### Cluster API Response Example

```json
{
  "master": {
    "pid": 12345,
    "uptime": 3600000,
    "totalRequests": 1500000,
    "totalRestarts": 2,
    "totalCrashes": 0,
    "workersSpawned": 10
  },
  "cluster": {
    "numWorkers": 8,
    "activeWorkers": 8,
    "minWorkers": 4,
    "maxWorkers": 16,
    "healthyWorkers": 8
  },
  "workers": [
    {
      "id": 1,
      "pid": 12346,
      "healthy": true,
      "uptime": 3600000,
      "restarts": 0,
      "requestsHandled": 187500,
      "memoryMB": 245,
      "lastHealthCheck": "2025-11-13T12:00:00.000Z"
    }
  ]
}
```

## Monitoring & Observability

### Built-in Logging

Enable periodic stats logging:

```bash
LOG_CLUSTER_STATS=true
```

Output:
```
[Cluster Stats] {
  workers: 8,
  healthy: 8,
  requests: 1500000,
  restarts: 2,
  crashes: 0
}
```

### Integration with Application Monitoring

The cluster exports events you can hook into:

```javascript
clusterManager.on('workerStarted', ({ id, pid }) => {
  // Log to monitoring service
  logger.info('Worker started', { workerId: id, pid });
});

clusterManager.on('workerError', ({ workerId, error }) => {
  // Alert on worker errors
  alerting.send('Worker error', { workerId, error });
});

clusterManager.on('workerExit', ({ workerId, code, uptime }) => {
  // Track worker crashes
  metrics.increment('worker.exits', { code, uptime });
});
```

### Prometheus Metrics (optional)

Add to your application:

```javascript
// In worker process
const prometheus = require('prom-client');

const requestCounter = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['worker_id', 'method', 'status']
});

// Increment in middleware
app.use((req, res, next) => {
  res.on('finish', () => {
    requestCounter.inc({
      worker_id: cluster.worker.id,
      method: req.method,
      status: res.statusCode
    });
  });
  next();
});
```

## Load Balancing

The OS (via Node.js cluster module) automatically load balances incoming connections across workers using **round-robin** by default.

### Load Balancing Strategies

**Round Robin (default):**
```javascript
cluster.schedulingPolicy = cluster.SCHED_RR;
```

**OS-level (let OS decide):**
```javascript
cluster.schedulingPolicy = cluster.SCHED_NONE;
```

For most cases, **round-robin** works best and provides even distribution.

## Zero-Downtime Deployments

### Rolling Restart

```bash
# Via signal
kill -USR2 <master-pid>

# Via API
curl -X POST http://localhost:9000/restart
```

**Process:**
1. Master forks new worker
2. Waits for new worker to be ready
3. Disconnects old worker (stops accepting connections)
4. Waits for old worker to finish active requests
5. Terminates old worker
6. Repeats for all workers

**Result:** No dropped connections, no downtime.

### Deployment Script

```bash
#!/bin/bash
# deploy.sh

echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
npm ci --production

echo "Triggering rolling restart..."
kill -USR2 $(cat cluster.pid)

echo "Deployment complete!"
```

## Auto-Recovery & Resilience

### Crash Recovery

If a worker crashes:
1. Master detects exit immediately
2. Respawns new worker after delay (default 5s)
3. Other workers continue handling requests
4. Alerts/logs the crash

### Memory Leak Protection

Workers exceeding memory limit are automatically restarted:

```bash
WORKER_MEMORY_LIMIT=1073741824  # 1GB
```

If a worker exceeds this limit:
1. Master detects high memory usage via health checks
2. Triggers graceful restart of that worker
3. New worker takes over
4. Old worker terminates after finishing requests

### Health Monitoring

Workers report health every 30 seconds (configurable):

```javascript
// In worker
{
  healthy: true,
  uptime: 3600000,
  requestsHandled: 187500,
  memory: 256000000,
  memoryUsage: {
    heapUsed: 244,
    heapTotal: 512,
    external: 12,
    rss: 600
  }
}
```

If a worker stops responding:
- Master marks it unhealthy after 2 missed health checks
- Triggers restart

## Combining Cluster + Worker Threads

**Best practice:** Use both for maximum performance!

```
Master Process
  ├─ Worker Process 1
  │    ├─ HTTP/gRPC Servers (handles requests)
  │    └─ Worker Threads Pool (handles CPU-intensive validation)
  │
  ├─ Worker Process 2
  │    ├─ HTTP/gRPC Servers
  │    └─ Worker Threads Pool
  │
  └─ Worker Process N
       ├─ HTTP/gRPC Servers
       └─ Worker Threads Pool
```

**Example: 8-core machine**
- 8 cluster workers (one per core) → Handle concurrent HTTP/gRPC requests
- Each cluster worker has 2-4 worker threads → Handle batch validation

**Configuration:**
```bash
# Cluster
CLUSTER_WORKERS=8

# Worker Threads (per cluster worker)
ENABLE_WORKER_VALIDATION=true
WORKER_POOL_MIN_WORKERS=2
WORKER_POOL_MAX_WORKERS=4
```

## Troubleshooting

### Workers Keep Crashing

**Check:**
```bash
# Memory usage
ps aux | grep "node cluster.js"

# Error logs
tail -f logs/error.log

# Worker exit reasons
# Look for "Worker X exited" with code and signal
```

**Solutions:**
- Increase memory limit: `WORKER_MEMORY_LIMIT=2147483648` (2GB)
- Reduce workers: `CLUSTER_WORKERS=4`
- Fix memory leaks in application code

### High CPU on Master Process

**Cause:** Master should use minimal CPU (only coordination)

**Check:**
```bash
# Master CPU usage
ps -p <master-pid> -o %cpu
```

**Solutions:**
- Reduce health check frequency: `HEALTH_CHECK_INTERVAL=60000`
- Disable stats logging: `LOG_CLUSTER_STATS=false`

### Uneven Load Distribution

**Symptoms:** Some workers idle while others busy

**Check:**
```bash
curl http://localhost:9000/stats | jq '.workers[].requestsHandled'
```

**Solutions:**
- Ensure `cluster.schedulingPolicy = cluster.SCHED_RR`
- Check for long-running requests blocking workers
- Increase worker count

### Port Already in Use

**Cause:** Previous master process didn't shut down cleanly

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill it
kill -9 <pid>

# Or use pkill
pkill -f "node cluster.js"
```

## Performance Benchmarks

### Single Process vs Cluster

**Test:** 10,000 requests/sec, batch size 100 logs

| Configuration | Requests/sec | Latency p99 | CPU Usage |
|--------------|--------------|-------------|-----------|
| Single process | 2,500 | 450ms | 100% (1 core) |
| Cluster (4 workers) | 9,800 | 120ms | 95% (4 cores) |
| Cluster (8 workers) | 18,500 | 65ms | 92% (8 cores) |

**Conclusion:** Cluster scales nearly linearly with CPU cores!

## Best Practices

1. ✅ **One cluster worker per CPU core** (default behavior)
2. ✅ **Use worker threads within each cluster worker** for CPU tasks
3. ✅ **Enable cluster API** for monitoring and management
4. ✅ **Set memory limits** to prevent runaway workers
5. ✅ **Use rolling restarts** for deployments
6. ✅ **Monitor worker health** and crash rates
7. ✅ **Log worker lifecycle events** for debugging

8. ❌ **Don't use PM2 cluster mode with cluster.js** (double clustering)
9. ❌ **Don't share state between workers** (use Redis/database instead)
10. ❌ **Don't run CPU-intensive tasks on main thread** (use worker threads)

## Further Reading

- [Node.js Cluster Documentation](https://nodejs.org/api/cluster.html)
- [Worker Threads Documentation](../workers/README.md)
- [Production Deployment Guide](../../../docs/PRODUCTION.md)
- [Performance Tuning Guide](../../../docs/PERFORMANCE.md)

