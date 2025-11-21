/**
 * Cluster Manager
 * 
 * Manages multiple Node.js worker processes for horizontal scaling.
 * Each worker process runs a complete copy of the application.
 * 
 * Architecture:
 * - Master process: Manages worker lifecycle, health monitoring, graceful restarts
 * - Worker processes: Handle HTTP/gRPC requests independently
 * - Each worker can also use worker threads for CPU-intensive tasks
 * 
 * Benefits:
 * - True multi-core utilization (separate processes)
 * - Isolated memory spaces (crash in one worker doesn't affect others)
 * - Zero-downtime deploys (graceful worker replacement)
 * - Better performance than single-process under high load
 */

const cluster = require('cluster');
const os = require('os');
const { EventEmitter } = require('events');

class ClusterManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.numWorkers = options.numWorkers || os.cpus().length;
    this.minWorkers = options.minWorkers || Math.max(1, Math.floor(this.numWorkers / 2));
    this.maxWorkers = options.maxWorkers || this.numWorkers * 2;
    this.workerRestartDelay = options.workerRestartDelay || 5000;
    this.gracefulShutdownTimeout = options.gracefulShutdownTimeout || 30000;
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.workerMemoryLimit = options.workerMemoryLimit || 1024 * 1024 * 1024; // 1GB default

    // State
    this.workers = new Map(); // workerId -> { worker, pid, restarts, startTime, lastHealthCheck }
    this.stats = {
      totalRequests: 0,
      totalRestarts: 0,
      totalCrashes: 0,
      uptime: Date.now(),
      workersSpawned: 0
    };

    // Flags
    this.isShuttingDown = false;
    this.isRestarting = false;

    console.log('[ClusterManager] Initializing cluster with', this.numWorkers, 'workers');
  }

  /**
   * Start the cluster
   */
  start() {
    if (!cluster.isMaster && !cluster.isPrimary) {
      throw new Error('ClusterManager.start() should only be called from master process');
    }

    console.log(`[ClusterManager] Master process ${process.pid} is running`);
    console.log(`[ClusterManager] Starting ${this.numWorkers} worker processes...`);

    // Fork initial workers
    for (let i = 0; i < this.numWorkers; i++) {
      this.forkWorker();
    }

    // Setup cluster event listeners
    this.setupClusterListeners();

    // Setup process signal handlers
    this.setupSignalHandlers();

    // Start health monitoring
    this.startHealthMonitoring();

    // Log initial status
    setTimeout(() => {
      console.log('[ClusterManager] Cluster started successfully');
      console.log('[ClusterManager] Workers:', Array.from(this.workers.keys()));
      this.emit('ready');
    }, 1000);
  }

  /**
   * Fork a new worker process
   */
  forkWorker() {
    const worker = cluster.fork({
      WORKER_ID: this.stats.workersSpawned,
      CLUSTER_MODE: 'true',
      MASTER_PID: process.pid
    });

    const workerId = worker.id;
    const workerState = {
      worker,
      id: workerId,
      pid: worker.process.pid,
      restarts: 0,
      startTime: Date.now(),
      lastHealthCheck: Date.now(),
      healthy: true,
      requestsHandled: 0,
      memory: 0
    };

    this.workers.set(workerId, workerState);
    this.stats.workersSpawned++;

    console.log(`[ClusterManager] Worker ${workerId} (PID: ${worker.process.pid}) forked`);

    // Setup worker message handlers
    worker.on('message', (msg) => this.handleWorkerMessage(workerId, msg));

    this.emit('workerStarted', workerState);

    return workerState;
  }

  /**
   * Setup cluster event listeners
   */
  setupClusterListeners() {
    // Worker online
    cluster.on('online', (worker) => {
      console.log(`[ClusterManager] Worker ${worker.id} (PID: ${worker.process.pid}) is online`);
    });

    // Worker listening
    cluster.on('listening', (worker, address) => {
      console.log(`[ClusterManager] Worker ${worker.id} listening on ${address.address}:${address.port}`);
      this.emit('workerListening', { workerId: worker.id, address });
    });

    // Worker disconnected
    cluster.on('disconnect', (worker) => {
      console.log(`[ClusterManager] Worker ${worker.id} disconnected`);
    });

    // Worker exit
    cluster.on('exit', (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });
  }

  /**
   * Handle worker exit
   */
  handleWorkerExit(worker, code, signal) {
    const workerId = worker.id;
    const workerState = this.workers.get(workerId);

    if (!workerState) return;

    const wasHealthy = workerState.healthy;
    const uptime = Date.now() - workerState.startTime;

    console.log(`[ClusterManager] Worker ${workerId} (PID: ${worker.process.pid}) exited`);
    console.log(`[ClusterManager]   Code: ${code}, Signal: ${signal}, Uptime: ${Math.round(uptime / 1000)}s`);

    // Remove from workers map
    this.workers.delete(workerId);

    // Update stats
    if (code !== 0 && !signal) {
      this.stats.totalCrashes++;
      console.error(`[ClusterManager] Worker ${workerId} crashed unexpectedly!`);
    }

    this.emit('workerExit', { workerId, code, signal, uptime, wasHealthy });

    // Respawn worker unless shutting down
    if (!this.isShuttingDown) {
      this.stats.totalRestarts++;

      // Immediate restart if we're below minimum
      if (this.workers.size < this.minWorkers) {
        console.log(`[ClusterManager] Below minimum workers (${this.workers.size}/${this.minWorkers}), respawning immediately`);
        this.forkWorker();
      } else {
        // Delayed restart for normal exits
        setTimeout(() => {
          if (!this.isShuttingDown && this.workers.size < this.numWorkers) {
            console.log(`[ClusterManager] Respawning worker to maintain ${this.numWorkers} workers`);
            this.forkWorker();
          }
        }, this.workerRestartDelay);
      }
    }
  }

  /**
   * Handle messages from worker processes
   */
  handleWorkerMessage(workerId, message) {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    switch (message.type) {
      case 'health':
        workerState.lastHealthCheck = Date.now();
        workerState.healthy = message.data.healthy;
        workerState.memory = message.data.memory;
        workerState.requestsHandled = message.data.requestsHandled || 0;

        // Check memory limit
        if (message.data.memory > this.workerMemoryLimit) {
          console.warn(`[ClusterManager] Worker ${workerId} exceeded memory limit: ${Math.round(message.data.memory / 1024 / 1024)}MB`);
          this.restartWorker(workerId, 'memory-limit');
        }
        break;

      case 'request_handled':
        workerState.requestsHandled++;
        this.stats.totalRequests++;
        break;

      case 'error':
        console.error(`[ClusterManager] Worker ${workerId} error:`, message.data);
        this.emit('workerError', { workerId, error: message.data });
        break;

      case 'ready':
        console.log(`[ClusterManager] Worker ${workerId} is ready to handle requests`);
        this.emit('workerReady', { workerId });
        break;

      default:
        // Custom message types
        this.emit('workerMessage', { workerId, message });
    }
  }

  /**
   * Restart a specific worker gracefully
   */
  async restartWorker(workerId, reason = 'manual') {
    const workerState = this.workers.get(workerId);
    if (!workerState) {
      console.warn(`[ClusterManager] Cannot restart worker ${workerId}: not found`);
      return false;
    }

    console.log(`[ClusterManager] Restarting worker ${workerId} (reason: ${reason})`);

    // Fork new worker first (zero-downtime)
    const newWorker = this.forkWorker();

    // Wait for new worker to be ready
    await this.waitForWorkerReady(newWorker.id, 10000);

    // Gracefully shutdown old worker
    await this.shutdownWorker(workerId);

    console.log(`[ClusterManager] Worker ${workerId} replaced with ${newWorker.id}`);
    return true;
  }

  /**
   * Wait for a worker to be ready
   */
  waitForWorkerReady(workerId, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Worker ${workerId} not ready after ${timeout}ms`));
      }, timeout);

      const onReady = (data) => {
        if (data.workerId === workerId) {
          clearTimeout(timer);
          this.removeListener('workerReady', onReady);
          resolve();
        }
      };

      this.on('workerReady', onReady);
    });
  }

  /**
   * Gracefully shutdown a worker
   */
  async shutdownWorker(workerId) {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    return new Promise((resolve) => {
      const worker = workerState.worker;

      // Setup timeout
      const timeout = setTimeout(() => {
        console.warn(`[ClusterManager] Worker ${workerId} didn't exit gracefully, forcing kill`);
        worker.kill('SIGKILL');
        resolve();
      }, this.gracefulShutdownTimeout);

      // Listen for exit
      worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Send disconnect signal
      worker.disconnect();

      // Send shutdown message
      worker.send({ type: 'shutdown' });
    });
  }

  /**
   * Rolling restart of all workers (zero-downtime)
   */
  async rollingRestart() {
    if (this.isRestarting) {
      console.warn('[ClusterManager] Rolling restart already in progress');
      return;
    }

    this.isRestarting = true;
    console.log('[ClusterManager] Starting rolling restart...');

    const workerIds = Array.from(this.workers.keys());

    for (let i = 0; i < workerIds.length; i++) {
      const workerId = workerIds[i];
      await this.restartWorker(workerId, 'rolling-restart');
      // Wait a bit between restarts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    this.isRestarting = false;
    console.log('[ClusterManager] Rolling restart complete');
    this.emit('rollingRestartComplete');
  }

  /**
   * Scale the cluster (add or remove workers)
   */
  async scale(targetWorkers) {
    if (targetWorkers < this.minWorkers) {
      console.warn(`[ClusterManager] Cannot scale below minimum workers (${this.minWorkers})`);
      return false;
    }

    if (targetWorkers > this.maxWorkers) {
      console.warn(`[ClusterManager] Cannot scale above maximum workers (${this.maxWorkers})`);
      return false;
    }

    const currentWorkers = this.workers.size;
    const diff = targetWorkers - currentWorkers;

    console.log(`[ClusterManager] Scaling from ${currentWorkers} to ${targetWorkers} workers (${diff > 0 ? '+' : ''}${diff})`);

    if (diff > 0) {
      // Scale up
      for (let i = 0; i < diff; i++) {
        this.forkWorker();
      }
    } else if (diff < 0) {
      // Scale down
      const workersToRemove = Array.from(this.workers.values())
        .sort((a, b) => b.startTime - a.startTime) // Remove newest workers first
        .slice(0, Math.abs(diff));

      for (let i = 0; i < workersToRemove.length; i++) {
        const workerState = workersToRemove[i];
        await this.shutdownWorker(workerState.id);
      }
    }

    this.numWorkers = targetWorkers;
    console.log(`[ClusterManager] Scaling complete: ${this.workers.size} workers`);
    this.emit('scaled', { targetWorkers, currentWorkers: this.workers.size });

    return true;
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health check on all workers
   */
  performHealthCheck() {
    const now = Date.now();

    for (const [workerId, workerState] of this.workers) {
      // Check if worker responded recently
      const timeSinceLastCheck = now - workerState.lastHealthCheck;

      if (timeSinceLastCheck > this.healthCheckInterval * 2) {
        console.warn(`[ClusterManager] Worker ${workerId} hasn't responded to health checks for ${Math.round(timeSinceLastCheck / 1000)}s`);
        workerState.healthy = false;

        // Restart unresponsive worker
        this.restartWorker(workerId, 'health-check-failed');
      } else {
        // Request health check
        workerState.worker.send({ type: 'health_check' });
      }
    }
  }

  /**
   * Setup process signal handlers
   */
  setupSignalHandlers() {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      console.log('[ClusterManager] Received SIGTERM, starting graceful shutdown...');
      await this.shutdown();
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('[ClusterManager] Received SIGINT, starting graceful shutdown...');
      await this.shutdown();
    });

    // Rolling restart on SIGUSR2
    process.on('SIGUSR2', async () => {
      console.log('[ClusterManager] Received SIGUSR2, starting rolling restart...');
      await this.rollingRestart();
    });
  }

  /**
   * Get cluster statistics
   */
  getStats() {
    const workerStats = Array.from(this.workers.values()).map(w => ({
      id: w.id,
      pid: w.pid,
      healthy: w.healthy,
      uptime: Date.now() - w.startTime,
      restarts: w.restarts,
      requestsHandled: w.requestsHandled,
      memoryMB: Math.round(w.memory / 1024 / 1024),
      lastHealthCheck: new Date(w.lastHealthCheck).toISOString()
    }));

    return {
      master: {
        pid: process.pid,
        uptime: Date.now() - this.stats.uptime,
        totalRequests: this.stats.totalRequests,
        totalRestarts: this.stats.totalRestarts,
        totalCrashes: this.stats.totalCrashes,
        workersSpawned: this.stats.workersSpawned
      },
      cluster: {
        numWorkers: this.numWorkers,
        activeWorkers: this.workers.size,
        minWorkers: this.minWorkers,
        maxWorkers: this.maxWorkers,
        healthyWorkers: workerStats.filter(w => w.healthy).length
      },
      workers: workerStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Broadcast message to all workers
   */
  broadcast(message) {
    const workerStates = Array.from(this.workers.values());
    for (let i = 0; i < workerStates.length; i++) {
      workerStates[i].worker.send(message);
    }
  }

  /**
   * Graceful shutdown of entire cluster
   */
  async shutdown() {
    if (this.isShuttingDown) {
      console.warn('[ClusterManager] Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    console.log('[ClusterManager] Shutting down cluster...');

    // Notify all workers
    this.broadcast({ type: 'shutdown' });

    // Shutdown all workers
    const shutdownPromises = Array.from(this.workers.keys()).map(workerId =>
      this.shutdownWorker(workerId)
    );

    await Promise.all(shutdownPromises);

    console.log('[ClusterManager] All workers shut down');
    this.emit('shutdown');

    // Exit master process
    process.exit(0);
  }
}

module.exports = ClusterManager;

