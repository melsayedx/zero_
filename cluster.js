#!/usr/bin/env node

/**
 * Cluster Entry Point
 * 
 * Starts the application in cluster mode with multiple worker processes.
 * 
 * Usage:
 *   node cluster.js
 *   node cluster.js --workers 8
 *   npm run start:cluster
 */

const cluster = require('cluster');
const ClusterManager = require('./src/adapters/cluster/cluster-manager');
const { ClusterWorker } = require('./src/adapters/cluster/cluster-worker');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    workers: parseInt(process.env.CLUSTER_WORKERS) || undefined,
    minWorkers: parseInt(process.env.CLUSTER_MIN_WORKERS) || undefined,
    maxWorkers: parseInt(process.env.CLUSTER_MAX_WORKERS) || undefined
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = parseInt(args[i + 1]);

    if (key === 'workers') config.workers = value;
    if (key === 'min-workers') config.minWorkers = value;
    if (key === 'max-workers') config.maxWorkers = value;
  }

  return config;
}

// Master process - manages worker processes
if (cluster.isMaster || cluster.isPrimary) {
  const config = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║            ZERO LOG INGEST - CLUSTER MODE                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const clusterManager = new ClusterManager({
    numWorkers: config.workers,
    minWorkers: config.minWorkers,
    maxWorkers: config.maxWorkers,
    workerRestartDelay: parseInt(process.env.WORKER_RESTART_DELAY) || 5000,
    gracefulShutdownTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) || 30000,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    workerMemoryLimit: parseInt(process.env.WORKER_MEMORY_LIMIT) || 1024 * 1024 * 1024
  });

  // Start the cluster
  clusterManager.start();

  // Optional: Expose cluster API endpoint
  if (process.env.CLUSTER_API_PORT) {
    startClusterAPI(clusterManager);
  }

  // Handle cluster-wide events
  clusterManager.on('ready', () => {
    console.log('[Cluster] All workers are ready and accepting connections');
    console.log(`[Cluster] Listening on port ${process.env.PORT || 3000}`);
    console.log('');
    console.log('Cluster API commands:');
    console.log('  kill -USR2 <master-pid>  → Rolling restart');
    console.log('  kill -TERM <master-pid>  → Graceful shutdown');
    console.log('');
  });

  clusterManager.on('workerError', ({ workerId, error }) => {
    console.error(`[Cluster] Worker ${workerId} error:`, error);
  });

  // Optional: periodic stats logging
  if (process.env.LOG_CLUSTER_STATS === 'true') {
    setInterval(() => {
      const stats = clusterManager.getStats();
      console.log('[Cluster Stats]', {
        workers: stats.cluster.activeWorkers,
        healthy: stats.cluster.healthyWorkers,
        requests: stats.master.totalRequests,
        restarts: stats.master.totalRestarts,
        crashes: stats.master.totalCrashes
      });
    }, 60000); // Every minute
  }
}

// Worker process - runs the application
else {
  (async () => {
    try {
      // Import application
      const createApp = require('./src/app');

      // Create application instance
      const app = await createApp({
        clusterMode: true,
        workerId: cluster.worker.id
      });

      // Wrap in cluster worker
      const clusterWorker = new ClusterWorker(app, {
        healthReportInterval: parseInt(process.env.HEALTH_REPORT_INTERVAL) || 30000
      });

      // Initialize
      await clusterWorker.initialize();

    } catch (error) {
      console.error(`[Worker ${cluster.worker.id}] Fatal error:`, error);
      process.exit(1);
    }
  })();
}

/**
 * Start cluster management API (optional)
 * Provides HTTP endpoint for cluster monitoring and control
 */
function startClusterAPI(clusterManager) {
  const http = require('http');
  const port = parseInt(process.env.CLUSTER_API_PORT);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // GET /stats - Get cluster statistics
    if (url.pathname === '/stats' && req.method === 'GET') {
      const stats = clusterManager.getStats();
      res.writeHead(200);
      res.end(JSON.stringify(stats, null, 2));
    }

    // POST /restart - Rolling restart
    else if (url.pathname === '/restart' && req.method === 'POST') {
      clusterManager.rollingRestart()
        .then(() => {
          res.writeHead(200);
          res.end(JSON.stringify({ message: 'Rolling restart initiated' }));
        })
        .catch(error => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        });
    }

    // POST /scale - Scale cluster
    else if (url.pathname === '/scale' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { workers } = JSON.parse(body);
          clusterManager.scale(workers)
            .then(success => {
              res.writeHead(success ? 200 : 400);
              res.end(JSON.stringify({
                message: success ? `Scaling to ${workers} workers` : 'Scale failed',
                currentWorkers: clusterManager.workers.size
              }));
            });
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    }

    // GET /health - Cluster health check
    else if (url.pathname === '/health' && req.method === 'GET') {
      const stats = clusterManager.getStats();
      const healthy = stats.cluster.healthyWorkers === stats.cluster.activeWorkers;

      res.writeHead(healthy ? 200 : 503);
      res.end(JSON.stringify({
        healthy,
        workers: stats.cluster.activeWorkers,
        healthyWorkers: stats.cluster.healthyWorkers
      }));
    }

    // 404
    else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port, () => {
    console.log(`[Cluster API] Listening on port ${port}`);
  });
}

