require('@dotenvx/dotenvx').config();
const Redis = require('ioredis');
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const RedisStreamQueue = require('../../src/infrastructure/queues/redis-stream-queue');
const RequestManager = require('../../src/infrastructure/request-processing/request-manager');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;
const CONSUMER_BATCH_SIZE = 500;

/**
 * Stage 05: Full Pipeline with Worker Threads (CUMULATIVE)
 * 
 * Matches actual project flow from DI Container:
 * 
 * Producer (Main Thread):
 *   HTTP Request → RequestManager (coalescing) → Redis Stream (XADD)
 * 
 * Consumer (Worker Threads via LogProcessorThreadManager):
 *   Redis Stream (XREADGROUP) → BatchBuffer → ClickHouse
 * 
 * Key difference from Stage 04:
 *   - Uses separate worker THREADS for Redis→ClickHouse processing
 *   - Main thread is freed for HTTP handling
 *   - True CPU isolation via worker_threads
 */
async function run() {
    const monitor = new PerformanceMonitor('05-full-pipeline-with-workers');
    console.log(`Starting Full Pipeline + Workers Benchmark: ${ITERATIONS} logs...`);
    console.log('Flow: RequestManager → Redis Streams → Worker Threads → ClickHouse');

    // ===== INFRASTRUCTURE SETUP =====
    const clickhouse = createClickHouseClient();

    // Clean up old benchmark logs to ensure accurate counting
    console.log('Cleaning up old benchmark logs...');
    await clickhouse.command({
        query: "ALTER TABLE logs DELETE WHERE app_id = 'benchmark-app'"
    });
    // Wait for mutation to process
    await new Promise(r => setTimeout(r, 1000));

    const redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        lazyConnect: true
    });
    await redisClient.connect();

    // Producer queue - main thread writes to this
    const queue = new RedisStreamQueue(redisClient, {
        streamKey: 'benchmark:workers:stream',
        groupName: 'benchmark-workers-group',
        consumerName: 'benchmark-producer',
        batchSize: CONSUMER_BATCH_SIZE,
        blockMs: 100,
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });
    await queue.initialize();

    // ===== WORKER THREAD MANAGER (Redis → ClickHouse) =====
    // This matches the project's LogProcessorThreadManager from DI Container
    const { redisConfig } = require('../../src/infrastructure/database/redis');
    const LogProcessorThreadManager = require('../../src/infrastructure/workers/log-processor-thread-manager');

    const threadManager = new LogProcessorThreadManager({
        workerCount: 3,
        redisConfig: { ...redisConfig, host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
        streamKey: 'benchmark:workers:stream',
        groupName: 'benchmark-workers-group',
        batchSize: CONSUMER_BATCH_SIZE,
        maxBatchSize: 10000,
        maxWaitTime: 500,             // Faster flushes for benchmark
        pollInterval: 0,
        claimMinIdleMs: 5000,         // Faster stale claim for benchmark
        retryQueueLimit: 10000,
        logger: { info: () => { }, warn: () => { }, error: console.error, child: () => ({ info: () => { }, warn: () => { }, error: console.error }) }
    });

    console.log('Starting worker threads...');
    await threadManager.start();

    // ===== PRODUCER: RequestManager → Redis Stream =====
    // This matches the project flow: RequestManager coalesces, then writes to Redis
    const producerBatchProcessor = async (batch) => {
        try {
            // Transform and write directly to Redis stream (like RedisLogRepository.saveBatch)
            const messages = batch.map(item => ({
                id: item.id,
                app_id: 'benchmark-app',
                level: 'INFO',
                message: item.message || 'Coalesced + Redis-buffered log',
                timestamp: Date.now(),
                source: 'benchmark',
                environment: 'development'
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
        maxWaitTime: 50,              // Match project setting (COALESCER_MAX_WAIT_TIME)
        maxBatchSize: 5000,           // Match project setting (COALESCER_MAX_BATCH_SIZE)
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });

    // ===== CONSUMER MONITORING =====
    let consumedCount = 0;
    const waitForCompletion = async () => {
        const startTime = Date.now();
        while (Date.now() - startTime < 60000) { // 60s timeout
            try {
                const pendingInfo = await queue.getPendingInfo();

                const result = await clickhouse.query({
                    query: "SELECT count() as count FROM logs WHERE app_id = 'benchmark-app'",
                    format: 'JSONEachRow',
                });
                const rows = await result.json();
                if (rows.length > 0) {
                    consumedCount = Number(rows[0].count);
                }

                if (Date.now() % 5000 < 600) {
                    console.log(`Waiting... Pending: ${pendingInfo.pendingCount}, Consumed: ${consumedCount}/${ITERATIONS}`);
                }

                if (pendingInfo.pendingCount === 0 && consumedCount >= ITERATIONS) {
                    return;
                }

            } catch (err) {
                // Ignore polling errors
            }
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

    console.log('\nProducing logs via RequestManager...');

    const promises = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();

        const promise = requestManager.add({
            id: `log-workers-${i}`,
            index: i,
            message: `Log entry ${i}`
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
    console.log('\nPromises settled. Flushing RequestManager...');

    await requestManager.forceFlush();

    // ===== STOP TIMING HERE =====
    // Client gets response when data reaches Redis, not ClickHouse
    // So we measure producer throughput, not end-to-end time
    clearInterval(systemInterval);
    monitor.stop();

    console.log('RequestManager flushed. Producer timing complete.');

    console.log('\nWaiting for worker threads to process (not timed)...');

    await consumerPromise;

    // ===== CLEANUP =====

    // IMPORTANT: Stop worker threads FIRST before cleaning up Redis
    console.log('Stopping worker threads...');
    await threadManager.shutdown();

    await requestManager.shutdown();
    await redisClient.del('benchmark:workers:stream');
    await redisClient.quit();
    await clickhouse.close();

    // ===== RESULTS =====
    console.log('\n\nFull Pipeline + Workers Benchmark Complete.');
    console.log(`Consumed: ${consumedCount}/${ITERATIONS} logs`);

    const results = monitor.getResults();
    results.pipeline = {
        consumedLogs: consumedCount,
        description: 'RequestManager → Redis Streams → Worker Threads → ClickHouse'
    };

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '05-worker-threads.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
