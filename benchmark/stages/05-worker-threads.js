require('@dotenvx/dotenvx').config();
const Redis = require('ioredis');
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const RedisStreamQueue = require('../../src/infrastructure/queues/redis-stream-queue');
const RequestManager = require('../../src/infrastructure/request-processing/request-manager');
const WorkerPool = require('../../src/infrastructure/workers/worker-pool');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;
const CONSUMER_BATCH_SIZE = 500;

/**
 * Stage 05: Full Pipeline with Worker Threads (CUMULATIVE)
 * 
 * Builds on ALL previous stages:
 * - Stage 01: ClickHouse insert (baseline)
 * - Stage 02: Fire-and-forget (async insert)
 * - Stage 03: Coalescing (batching)
 * - Stage 04: Redis Streams (buffer)
 * - Stage 05: Worker Threads (CPU offload) ← THIS STAGE
 * 
 * Full flow:
 * Request → Worker Thread (validation) → Coalescing → Redis Streams → ClickHouse
 */
async function run() {
    const monitor = new PerformanceMonitor('05-full-pipeline-with-workers');
    console.log(`Starting Full Pipeline + Workers Benchmark: ${ITERATIONS} logs...`);
    console.log('Flow: Worker Validation → Coalescing → Redis Streams → ClickHouse');

    // ===== INFRASTRUCTURE SETUP =====
    const clickhouse = createClickHouseClient();

    const redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        lazyConnect: true
    });
    await redisClient.connect();

    const queue = new RedisStreamQueue(redisClient, {
        streamKey: 'benchmark:workers:stream',
        groupName: 'benchmark-workers-group',
        consumerName: 'benchmark-consumer',
        batchSize: CONSUMER_BATCH_SIZE,
        blockMs: 100,
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });
    await queue.initialize();

    // WORKER POOL for validation
    const workerPool = new WorkerPool({
        minWorkers: 2,
        maxWorkers: 4,
        workerPath: path.resolve(__dirname, '../../src/infrastructure/workers/validation-worker.js'),
        logger: { info: () => { }, warn: () => { }, error: console.error }
    });
    await new Promise(r => setTimeout(r, 1000)); // Wait for workers to init

    // ===== COALESCING PRODUCER (with worker validation) =====
    const producerBatchProcessor = async (batch) => {
        try {
            // WORKER THREAD: Offload validation to worker
            const validationResult = await workerPool.execute('validate_batch', {
                logs: batch.map(item => ({
                    app_id: 'benchmark-app',
                    level: 'INFO',
                    message: item.message || 'worker-validated log'
                }))
            });

            // Push validated batch to Redis stream (fire-and-forget to Redis)
            const messages = batch.map((item, idx) => ({
                id: item.id,
                app_id: 'benchmark-app',
                level: 'INFO',
                message: 'Worker-validated + coalesced + redis-buffered',
                timestamp: Date.now(),
                validated: true
            }));

            await queue.add(messages);
            return batch.map(() => ({ success: true }));

        } catch (error) {
            console.error('Producer batch error:', error.message);
            return batch.map(() => ({ success: false }));
        }
    };

    const requestManager = new RequestManager(producerBatchProcessor, {
        enabled: true,
        maxWaitTime: 20,
        maxBatchSize: 500,
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });

    // ===== CONSUMER (Redis → ClickHouse) =====
    // ===== WORKER THREAD MANAGER (Redis → ClickHouse) =====
    const { redisConfig } = require('../../src/infrastructure/database/redis');
    const LogProcessorThreadManager = require('../../src/infrastructure/workers/log-processor-thread-manager');

    // Create thread manager
    const threadManager = new LogProcessorThreadManager({
        workerCount: 3, // Enable parallelism
        redisConfig: { ...redisConfig, host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
        streamKey: 'benchmark:workers:stream',
        groupName: 'benchmark-workers-group',
        batchSize: CONSUMER_BATCH_SIZE,
        logger: { info: () => { }, warn: () => { }, error: console.error, child: () => ({ info: () => { }, warn: () => { }, error: console.error }) }
    });

    console.log('Starting worker threads...');
    await threadManager.start();

    // ===== CONSUMER MONITORING =====
    // Since workers run in background, we poll ClickHouse to check progress
    let consumedCount = 0;
    const waitForCompletion = async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < 60000) { // 60s timeout
            try {
                // Check pending messages (should be 0 when done)
                const pendingInfo = await queue.getPendingInfo();

                // Also check ClickHouse count if needed (optional for speed here)
                // For now, we trust flow if pending -> 0 and stream length correct

                if (pendingInfo.pendingCount === 0 && consumedCount >= ITERATIONS) {
                    return;
                }

                // Naive progress estimation based on producer
                // In a real benchmark we'd query CH "SELECT count() FROM logs_benchmark"
                // But let's assume if queue is empty after production, we're done

            } catch (err) { }
            await new Promise(r => setTimeout(r, 500));
        }
        console.warn('Timeout waiting for workers to finish');
    };

    const consumerPromise = waitForCompletion();

    // ===== PRODUCER EXECUTION =====
    monitor.start();
    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    console.log('\nProducing (P) with worker validation, consuming (C)...');

    const promises = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();

        const promise = requestManager.add({
            id: `log-workers-${i}`,
            index: i,
            message: `Log entry ${i} for worker validation`
        })
            .then(() => {
                const duration = performance.now() - start;
                monitor.recordRequest(duration);
            })
            .catch(() => {
                monitor.recordRequest(0, 0, true);
            });

        promises.push(promise);

        if (i % 1000 === 0) process.stdout.write('P');
    }

    await Promise.allSettled(promises);
    await requestManager.forceFlush();

    console.log('\nProducer done. Waiting for consumer...');

    const consumerTimeout = setTimeout(() => { consumerRunning = false; }, 30000);
    await consumerPromise;
    clearTimeout(consumerTimeout);

    // ===== CLEANUP =====
    clearInterval(systemInterval);
    monitor.stop();

    await requestManager.shutdown();
    await workerPool.shutdown();
    await redisClient.del('benchmark:workers:stream');
    await redisClient.quit();
    await clickhouse.close();

    // ===== RESULTS =====
    console.log('\n\nFull Pipeline + Workers Benchmark Complete.');
    console.log(`Consumed: ${consumedCount}/${ITERATIONS} logs`);

    const results = monitor.getResults();
    results.pipeline = {
        consumedLogs: consumedCount,
        description: 'Worker Threads → Coalescing → Redis Streams → ClickHouse (full cumulative)'
    };

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '05-worker-threads.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
