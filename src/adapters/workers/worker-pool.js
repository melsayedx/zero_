/**
 * Worker Pool Manager
 *
 * Manages a pool of worker threads for CPU-intensive operations.
 * Provides load balancing, health monitoring, and graceful shutdown.
 *
 * Benefits:
 * - Prevents event loop blocking during validation
 * - Scales with available CPU cores
 * - Reuses worker threads to reduce overhead
 * - Provides health monitoring and error recovery
 */

const { Worker } = require('worker_threads');
const path = require('path');
const { EventEmitter } = require('events');
const os = require('os');

class WorkerPool extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.workerPath = options.workerPath || path.join(__dirname, 'validation-worker.js');
    this.minWorkers = options.minWorkers || Math.max(1, Math.floor(os.cpus().length / 2));
    this.maxWorkers = options.maxWorkers || Math.min(os.cpus().length, 8);
    this.taskTimeout = options.taskTimeout || 30000; // 30 seconds
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
    this.maxQueueSize = options.maxQueueSize || 1000;

    // Pool state
    this.workers = new Map(); // workerId -> { worker, busy, lastUsed, health }
    this.taskQueue = [];
    this.nextWorkerId = 1;
    this.nextRequestId = 1;
    this.pendingTasks = new Map(); // requestId -> { resolve, reject, timeout }

    // Metrics
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      currentWorkers: 0,
      peakWorkers: 0,
      queueSize: 0,
      healthChecks: 0,
      unhealthyWorkers: 0
    };

    // Start the pool
    this.initialize();
    this.startHealthChecks();

    console.log(`[WorkerPool] Initialized with ${this.minWorkers}-${this.maxWorkers} workers`);
  }

  /**
   * Initialize minimum number of workers
   */
  initialize() {
    for (let i = 0; i < this.minWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * Create a new worker
   */
  createWorker() {
    const workerId = this.nextWorkerId++;
    const worker = new Worker(this.workerPath);

    const workerState = {
      worker,
      workerId,
      busy: false,
      lastUsed: Date.now(),
      health: 'unknown',
      tasksCompleted: 0,
      tasksFailed: 0,
      createdAt: Date.now()
    };

    this.workers.set(workerId, workerState);
    this.metrics.currentWorkers++;
    this.metrics.peakWorkers = Math.max(this.metrics.peakWorkers, this.metrics.currentWorkers);

    // Handle worker messages
    worker.on('message', (message) => {
      if (message.type === 'ready') {
        workerState.health = 'healthy';
        this.emit('workerReady', workerId);
      } else {
        this.handleWorkerResponse(workerId, message);
      }
    });

    // Handle worker errors
    worker.on('error', (error) => {
      console.error(`[WorkerPool] Worker ${workerId} error:`, error.message);
      workerState.health = 'error';
      this.metrics.unhealthyWorkers++;
      this.handleWorkerFailure(workerId);
    });

    // Handle worker exit
    worker.on('exit', (code) => {
      console.log(`[WorkerPool] Worker ${workerId} exited with code ${code}`);
      this.removeWorker(workerId);

      // Replace worker if we're below minimum
      if (this.metrics.currentWorkers < this.minWorkers) {
        setTimeout(() => this.createWorker(), 1000);
      }
    });

    return workerId;
  }

  /**
   * Handle response from worker
   */
  handleWorkerResponse(workerId, message) {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    workerState.lastUsed = Date.now();
    workerState.tasksCompleted++;
    workerState.busy = false;

    const { requestId, type, data, error } = message;
    const pendingTask = this.pendingTasks.get(requestId);

    if (pendingTask) {
      clearTimeout(pendingTask.timeout);
      this.pendingTasks.delete(requestId);

      this.metrics.completedTasks++;

      if (error) {
        this.metrics.failedTasks++;
        pendingTask.reject(new Error(error.message));
      } else {
        pendingTask.resolve(data);
      }
    }

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Handle worker failure
   */
  handleWorkerFailure(workerId) {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    // Fail all pending tasks for this worker
    for (const [requestId, task] of this.pendingTasks) {
      if (task.workerId === workerId) {
        clearTimeout(task.timeout);
        this.pendingTasks.delete(requestId);
        this.metrics.failedTasks++;
        task.reject(new Error(`Worker ${workerId} failed`));
      }
    }

    // Remove the failed worker
    this.removeWorker(workerId);

    // Create replacement worker
    setTimeout(() => this.createWorker(), 2000);
  }

  /**
   * Remove a worker from the pool
   */
  removeWorker(workerId) {
    const workerState = this.workers.get(workerId);
    if (workerState) {
      try {
        workerState.worker.terminate();
      } catch (error) {
        // Worker may already be terminated
      }
      this.workers.delete(workerId);
      this.metrics.currentWorkers--;
    }
  }

  /**
   * Execute a task using a worker
   */
  async execute(type, data, options = {}) {
    const requestId = this.nextRequestId++;
    this.metrics.totalTasks++;

    return new Promise((resolve, reject) => {
      const task = {
        requestId,
        type,
        data,
        resolve,
        reject,
        submittedAt: Date.now(),
        priority: options.priority || 0
      };

      // Set timeout
      task.timeout = setTimeout(() => {
        this.pendingTasks.delete(requestId);
        this.metrics.failedTasks++;
        reject(new Error(`Task timeout after ${this.taskTimeout}ms`));
      }, this.taskTimeout);

      this.taskQueue.push(task);
      this.metrics.queueSize = this.taskQueue.length;

      // Sort queue by priority (higher priority first)
      this.taskQueue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  /**
   * Process the task queue
   */
  processQueue() {
    // Skip if queue is empty
    if (this.taskQueue.length === 0) return;

    // Find available worker
    const availableWorker = this.findAvailableWorker();
    if (!availableWorker) {
      // Scale up if possible
      if (this.metrics.currentWorkers < this.maxWorkers) {
        this.createWorker();
      }
      return; // No worker available, task stays in queue
    }

    // Get next task
    const task = this.taskQueue.shift();
    this.metrics.queueSize = this.taskQueue.length;

    if (task) {
      this.assignTaskToWorker(task, availableWorker);
    }
  }

  /**
   * Find an available worker
   */
  findAvailableWorker() {
    // Prefer healthy, non-busy workers that were used least recently
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => !w.busy && w.health === 'healthy')
      .sort((a, b) => a.lastUsed - b.lastUsed);

    return availableWorkers[0];
  }

  /**
   * Assign task to worker
   */
  assignTaskToWorker(task, workerState) {
    workerState.busy = true;
    workerState.lastUsed = Date.now();

    task.workerId = workerState.workerId;
    this.pendingTasks.set(task.requestId, task);

    // Send task to worker
    workerState.worker.postMessage({
      requestId: task.requestId,
      type: task.type,
      data: task.data
    });
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health checks on all workers
   */
  async performHealthChecks() {
    const healthCheckPromises = [];

    for (const [workerId, workerState] of this.workers) {
      if (workerState.health !== 'error') {
        healthCheckPromises.push(
          this.execute('health_check', {}, { priority: 100 })
            .then(() => {
              workerState.health = 'healthy';
            })
            .catch(() => {
              workerState.health = 'unhealthy';
              this.metrics.unhealthyWorkers++;
            })
        );
      }
    }

    await Promise.allSettled(healthCheckPromises);
    this.metrics.healthChecks++;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const workerStats = Array.from(this.workers.values()).map(w => ({
      id: w.workerId,
      busy: w.busy,
      health: w.health,
      tasksCompleted: w.tasksCompleted,
      tasksFailed: w.tasksFailed,
      lastUsed: new Date(w.lastUsed).toISOString(),
      uptime: Date.now() - w.createdAt
    }));

    return {
      ...this.metrics,
      workers: workerStats,
      queueLength: this.taskQueue.length,
      averageQueueTime: this.calculateAverageQueueTime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate average queue time
   */
  calculateAverageQueueTime() {
    if (this.taskQueue.length === 0) return 0;

    const totalQueueTime = this.taskQueue.reduce((sum, task) => {
      return sum + (Date.now() - task.submittedAt);
    }, 0);

    return Math.round(totalQueueTime / this.taskQueue.length);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[WorkerPool] Shutting down...');

    // Stop accepting new tasks
    this.taskQueue = [];

    // Shutdown all workers
    const shutdownPromises = [];
    for (const [workerId, workerState] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          workerState.worker.once('exit', resolve);
          workerState.worker.postMessage({ type: 'shutdown' });
        })
      );
    }

    // Wait for all workers to shutdown
    await Promise.all(shutdownPromises);

    this.workers.clear();
    console.log('[WorkerPool] Shutdown complete');
  }
}

module.exports = WorkerPool;
