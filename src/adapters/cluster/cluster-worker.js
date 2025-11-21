/**
 * Cluster Worker Process
 * 
 * Individual worker process that runs the full application.
 * Communicates with master process for health monitoring and coordination.
 * 
 * Each worker:
 * - Runs HTTP and gRPC servers independently
 * - Can use worker threads for CPU-intensive tasks
 * - Reports health status to master
 * - Handles graceful shutdown
 */

const cluster = require('cluster');

class ClusterWorker {
  constructor(app, options = {}) {
    if (cluster.isMaster || cluster.isPrimary) {
      throw new Error('ClusterWorker should only be instantiated in worker processes');
    }

    this.app = app;
    this.workerId = cluster.worker.id;
    this.options = options;

    // Stats
    this.stats = {
      requestsHandled: 0,
      startTime: Date.now(),
      lastHealthReport: Date.now()
    };

    // Setup
    this.setupProcessHandlers();
    this.setupMasterMessageHandlers();
    this.startHealthReporting();

    console.log(`[ClusterWorker ${this.workerId}] Process ${process.pid} started`);
  }

  /**
   * Initialize the worker
   */
  async initialize() {
    try {
      // Start the application
      await this.app.start();

      // Notify master that worker is ready
      this.sendToMaster({
        type: 'ready',
        data: {
          workerId: this.workerId,
          pid: process.pid
        }
      });

      console.log(`[ClusterWorker ${this.workerId}] Initialized and ready`);
    } catch (error) {
      console.error(`[ClusterWorker ${this.workerId}] Initialization failed:`, error);
      this.sendToMaster({
        type: 'error',
        data: {
          message: error.message,
          stack: error.stack
        }
      });
      process.exit(1);
    }
  }

  /**
   * Setup process signal handlers
   */
  setupProcessHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error(`[ClusterWorker ${this.workerId}] Uncaught exception:`, error);
      this.sendToMaster({
        type: 'error',
        data: {
          type: 'uncaughtException',
          message: error.message,
          stack: error.stack
        }
      });

      // Give time to report, then exit
      setTimeout(() => process.exit(1), 1000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[ClusterWorker ${this.workerId}] Unhandled rejection:`, reason);
      this.sendToMaster({
        type: 'error',
        data: {
          type: 'unhandledRejection',
          message: reason?.message || String(reason),
          stack: reason?.stack
        }
      });
    });

    // Handle disconnect from master
    process.on('disconnect', () => {
      console.log(`[ClusterWorker ${this.workerId}] Disconnected from master, shutting down...`);
      this.gracefulShutdown();
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      console.log(`[ClusterWorker ${this.workerId}] Received SIGTERM, shutting down...`);
      this.gracefulShutdown();
    });

    // Handle SIGINT
    process.on('SIGINT', () => {
      console.log(`[ClusterWorker ${this.workerId}] Received SIGINT, shutting down...`);
      this.gracefulShutdown();
    });
  }

  /**
   * Setup handlers for messages from master process
   */
  setupMasterMessageHandlers() {
    process.on('message', (message) => {
      if (!message || typeof message !== 'object') return;

      switch (message.type) {
        case 'shutdown':
          this.gracefulShutdown();
          break;

        case 'health_check':
          this.reportHealth();
          break;

        case 'get_stats':
          this.sendStats();
          break;

        case 'config_update':
          this.handleConfigUpdate(message.data);
          break;

        default:
          // Pass to application for custom handling
          if (this.app.handleMasterMessage) {
            this.app.handleMasterMessage(message);
          }
      }
    });
  }

  /**
   * Start periodic health reporting to master
   */
  startHealthReporting() {
    const interval = this.options.healthReportInterval || 30000; // 30 seconds

    setInterval(() => {
      this.reportHealth();
    }, interval);
  }

  /**
   * Report health status to master
   */
  reportHealth() {
    const memoryUsage = process.memoryUsage();

    this.sendToMaster({
      type: 'health',
      data: {
        healthy: true,
        workerId: this.workerId,
        pid: process.pid,
        uptime: Date.now() - this.stats.startTime,
        requestsHandled: this.stats.requestsHandled,
        memory: memoryUsage.heapUsed,
        memoryUsage: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024)
        }
      }
    });

    this.stats.lastHealthReport = Date.now();
  }

  /**
   * Send statistics to master
   */
  sendStats() {
    const stats = {
      workerId: this.workerId,
      pid: process.pid,
      uptime: Date.now() - this.stats.startTime,
      requestsHandled: this.stats.requestsHandled,
      memory: process.memoryUsage()
    };

    // Add application-specific stats if available
    if (this.app.getStats) {
      stats.application = this.app.getStats();
    }

    this.sendToMaster({
      type: 'stats',
      data: stats
    });
  }

  /**
   * Handle configuration updates from master
   */
  handleConfigUpdate(config) {
    console.log(`[ClusterWorker ${this.workerId}] Received config update:`, config);

    if (this.app.updateConfig) {
      this.app.updateConfig(config);
    }
  }

  /**
   * Send message to master process
   */
  sendToMaster(message) {
    try {
      if (process.send) {
        process.send(message);
      }
    } catch (error) {
      console.error(`[ClusterWorker ${this.workerId}] Failed to send message to master:`, error.message);
    }
  }

  /**
   * Increment request counter (call this from middleware)
   */
  incrementRequestCount() {
    this.stats.requestsHandled++;
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    console.log(`[ClusterWorker ${this.workerId}] Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (this.app.stopAcceptingConnections) {
        await this.app.stopAcceptingConnections();
      }

      // Wait for active requests to complete (with timeout)
      if (this.app.waitForActiveRequests) {
        await Promise.race([
          this.app.waitForActiveRequests(),
          new Promise(resolve => setTimeout(resolve, 25000)) // 25s timeout
        ]);
      }

      // Shutdown the application
      if (this.app.shutdown) {
        await this.app.shutdown();
      }

      console.log(`[ClusterWorker ${this.workerId}] Graceful shutdown complete`);
      process.exit(0);
    } catch (error) {
      console.error(`[ClusterWorker ${this.workerId}] Shutdown error:`, error);
      process.exit(1);
    }
  }
}

/**
 * Helper function to create request counter hook for Fastify
 */
function createRequestCounterHook(clusterWorker) {
  return (request, reply, done) => {
    clusterWorker.incrementRequestCount();
    done();
  };
}

module.exports = {
  ClusterWorker,
  createRequestCounterHook
};

