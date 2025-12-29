/**
 * Log Processor Thread Manager
 *
 * Manages the lifecycle of LogProcessorThread worker threads.
 * Handles spawning, auto-restart on crash, health monitoring, and graceful shutdown.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const { LoggerFactory } = require('../logging');

class LogProcessorThreadManager {
    /**
     * @param {Object} options Configuration options
     * @param {number} options.workerCount Number of worker threads to spawn
     * @param {string} options.streamKey Redis stream key
     * @param {string} options.groupName Consumer group name
     * @param {number} options.batchSize Batch size per read
     * @param {number} options.maxBatchSize Max buffer size before flush
     * @param {number} options.maxWaitTime Max time before flush
     * @param {number} options.pollInterval Polling interval
     * @param {number} options.claimMinIdleMs Idle time before claiming
     * @param {number} options.retryQueueLimit Backpressure limit
     * @param {string} options.clickhouseTable ClickHouse table name
     * @param {Object} options.logger Logger instance
     */
    constructor(options) {
        this.workerCount = options.workerCount;
        this.options = options;
        this.logger = options.logger || LoggerFactory.child({ component: 'ThreadManager' });

        // Worker tracking
        this.workers = new Map(); // index -> Worker
        this.restartCounts = new Map(); // index -> count
        this.isShuttingDown = false;

        // Path to worker thread script
        this.workerScriptPath = path.join(__dirname, 'log-processor.thread.js');

        // Instance ID for unique consumer names
        // - Single process: use hostname (stable across restarts for fast recovery)
        // - Multi-process: MUST set WORKER_INSTANCE_ID to avoid conflicts
        //   e.g., WORKER_INSTANCE_ID=1, WORKER_INSTANCE_ID=2, or pod name in K8s
        this.instanceId = process.env.WORKER_INSTANCE_ID || os.hostname();
    }

    async start() {
        this.logger.info('Starting worker threads', { count: this.workerCount });

        const startPromises = new Array(this.workerCount);
        for (let i = 0; i < this.workerCount; i++) {
            startPromises[i] = this.spawnWorker(i);
        }

        await Promise.all(startPromises);
        this.logger.info('All worker threads started');
    }

    /**
     * Spawn a single worker thread
     * @param {number} index Worker index
     */
    async spawnWorker(index) {
        // Consumer name format: worker-{instanceId}-{threadIndex}
        // instanceId is unique per process (hostname-pid or WORKER_INSTANCE_ID)
        const consumerName = `worker-${this.instanceId}-${index}`;

        // Thread 0 is dedicated to recovery (XAUTOCLAIM), rest are consumers (XREADGROUP)
        const workerRole = index === 0 ? 'recovery' : 'consumer';

        const workerData = {
            workerIndex: index,
            consumerName,
            workerRole,
            streamKey: this.options.streamKey,
            groupName: this.options.groupName,
            batchSize: this.options.batchSize,
            maxBatchSize: this.options.maxBatchSize,
            maxWaitTime: this.options.maxWaitTime,
            pollInterval: this.options.pollInterval,
            claimMinIdleMs: this.options.claimMinIdleMs,
            blockMs: this.options.blockMs,
            retryQueueLimit: this.options.retryQueueLimit,
            clickhouseTable: this.options.clickhouseTable,
            recoveryIntervalMs: this.options.recoveryIntervalMs
        };

        return new Promise((resolve, reject) => {
            const worker = new Worker(this.workerScriptPath, { workerData });

            // Track the worker
            this.workers.set(index, worker);

            // Initialize restart count if not exists
            if (!this.restartCounts.has(index)) {
                this.restartCounts.set(index, 0);
            }

            const readyHandler = (message) => {
                if (message.type === 'ready') {
                    this.logger.info('Worker thread ready', { index, consumerName });
                    // Reset restart count on successful start
                    this.restartCounts.set(index, 0);
                    worker.off('message', readyHandler);
                    resolve(worker);
                }
            };
            worker.on('message', readyHandler);

            worker.on('error', (error) => {
                this.logger.error('Worker thread error', { index, error: error.message });
            });

            // Handle exit - Auto-restart with exponential backoff
            worker.on('exit', (code) => {
                this.workers.delete(index);

                if (code !== 0 && !this.isShuttingDown) {
                    const restartCount = this.restartCounts.get(index) || 0;
                    const delay = Math.min(1000 * Math.pow(2, restartCount), 30000);

                    this.logger.warn('Worker thread crashed, restarting', {
                        index,
                        exitCode: code,
                        restartCount: restartCount + 1,
                        delayMs: delay
                    });

                    this.restartCounts.set(index, restartCount + 1);

                    setTimeout(() => {
                        if (!this.isShuttingDown) {
                            this.spawnWorker(index).catch(err => {
                                this.logger.error('Failed to restart worker', { index, error: err.message });
                            });
                        }
                    }, delay);
                } else if (code === 0) {
                    this.logger.info('Worker thread exited gracefully', { index });
                }
            });

            setTimeout(() => {
                if (!this.workers.has(index)) {
                    reject(new Error(`Worker ${index} failed to start within timeout`));
                }
            }, 30000);
        });
    }

    /**
     * Get health status from all workers
     */
    async getHealth() {
        const healthPromises = new Array(this.workerCount);

        for (let i = 0; i < this.workerCount; i++) {
            const worker = this.workers.get(i);
            if (!worker) continue;

            healthPromises.push(
                new Promise((resolve) => {
                    const requestId = Date.now();
                    const timeout = setTimeout(() => {
                        resolve({ index: i, healthy: false, error: 'timeout' });
                    }, 5000);

                    const handler = (message) => {
                        if (message.type === 'health_response' && message.requestId === requestId) {
                            clearTimeout(timeout);
                            worker.off('message', handler);
                            resolve({ index: i, healthy: true, ...message.data });
                        }
                    };

                    worker.on('message', handler);
                    worker.postMessage({ type: 'health', requestId });
                })
            );
        }

        const results = await Promise.all(healthPromises);
        return {
            totalWorkers: this.workerCount,
            activeWorkers: this.workers.size,
            workers: results
        };
    }

    async shutdown() {
        this.logger.info('Shutting down all worker threads...');
        this.isShuttingDown = true;

        const shutdownPromises = new Array(this.workerCount);

        for (let i = 0; i < this.workerCount; i++) {
            const worker = this.workers.get(i);
            if (!worker) continue;

            shutdownPromises.push(
                new Promise((resolve) => {
                    const requestId = Date.now();
                    const timeout = setTimeout(() => {
                        this.logger.warn('Worker shutdown timeout, terminating', { index: i });
                        worker.terminate();
                        resolve();
                    }, 10000);

                    const handler = (message) => {
                        if (message.type === 'shutdown_complete' && message.requestId === requestId) {
                            clearTimeout(timeout);
                            worker.off('message', handler);
                            this.logger.info('Worker shutdown complete', { index: i });
                            resolve();
                        }
                    };

                    worker.on('message', handler);
                    worker.postMessage({ type: 'shutdown', requestId });
                })
            );
        }

        await Promise.all(shutdownPromises);
        this.workers.clear();
        this.logger.info('All worker threads shut down');
    }
}

module.exports = LogProcessorThreadManager;

