require('@dotenvx/dotenvx').config();
const Redis = require('ioredis');
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const RedisStreamQueue = require('../../src/infrastructure/queues/redis-stream-queue');
const RedisLogRepository = require('../../src/infrastructure/persistence/redis-log.repository');
const RequestManager = require('../../src/infrastructure/request-processing/request-manager');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;
const CONSUMER_BATCH_SIZE = 500;

async function run() {
    const monitor = new PerformanceMonitor('04-full-pipeline');
    console.log(`Starting Full Pipeline Benchmark: Coalescing → Redis Streams → ClickHouse`);
    console.log(`Iterations: ${ITERATIONS}`);

    // ===== INFRASTRUCTURE SETUP =====
    const clickhouse = createClickHouseClient();

    // Create distinct clients for Producer and Consumer to avoid XREAD BLOCK blocking XADD
    const producerClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    });
    const consumerClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    });

    const streamKey = 'benchmark:pipeline:stream';

    // Clean up previous run to avoid NOGROUP errors or stale data
    try {
        await producerClient.del(streamKey);
    } catch (e) {
        // ignore
    }

    // Producer Repository (for adding messages)
    const producerRepo = new RedisLogRepository(producerClient, {
        streamKey,
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });

    // Consumer Queue (for reading)
    const consumerQueue = new RedisStreamQueue(consumerClient, {
        streamKey,
        groupName: 'benchmark-pipeline-group',
        consumerName: 'benchmark-consumer',
        batchSize: CONSUMER_BATCH_SIZE,
        blockMs: 100,
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });

    // Initialize consumer group
    await consumerQueue.initialize();

    // ===== COALESCING PRODUCER =====
    let totalProduced = 0;
    const producerBatchProcessor = async (batch) => {
        const messages = batch.map(item => ({
            id: item.id,
            app_id: 'benchmark-app',
            level: 'INFO',
            message: 'Full pipeline log entry',
            timestamp: Date.now()
        }));

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Redis save timeout')), 5000));

            await Promise.race([
                producerRepo.save(messages),
                timeoutPromise
            ]);
            totalProduced += messages.length;
            if (totalProduced % 1000 < batch.length) {
                console.log(`[Producer] Total produced: ${totalProduced}`);
            }
            return batch.map(() => ({ success: true }));
        } catch (error) {
            console.error('Producer batch error:', error.message);
            return batch.map(() => ({ success: false, error: error.message }));
        }
    };

    const requestManager = new RequestManager(producerBatchProcessor, {
        enabled: true,
        maxWaitTime: 50,      // Match project COALESCER_MAX_WAIT_TIME
        maxBatchSize: 5000,   // Match project COALESCER_MAX_BATCH_SIZE
        logger: { info: () => { }, debug: () => { }, error: console.error }
    });

    // ===== CONSUMER (Redis → ClickHouse) =====
    let consumerRunning = true;
    let consumedCount = 0;
    let consumerErrors = 0;
    let emptyReads = 0;
    const MAX_EMPTY_READS = 50; // Allow 50 empty reads (5 seconds with 100ms block) before stopping

    const runConsumer = async () => {
        while (consumerRunning || consumedCount < ITERATIONS) {
            try {
                const messages = await consumerQueue.read(CONSUMER_BATCH_SIZE);

                if (messages.length === 0) {
                    emptyReads++;
                    // Only stop if producer is done AND we've had many empty reads
                    if (!consumerRunning && emptyReads >= MAX_EMPTY_READS) {
                        console.log(`Consumer stopping after ${emptyReads} empty reads.`);
                        break;
                    }
                    continue;
                }

                // Reset empty reads counter on successful read
                emptyReads = 0;

                const values = messages.map(msg => ({
                    id: msg.data.id || `consumed-${consumedCount}`,
                    app_id: msg.data.app_id || 'benchmark-app',
                    level: msg.data.level || 'INFO',
                    message: msg.data.message || 'consumed',
                    timestamp: msg.data.timestamp || Date.now()
                }));

                await clickhouse.insert({
                    table: 'logs_benchmark',
                    values,
                    format: 'JSONEachRow'
                });

                await consumerQueue.ack(messages.map(m => m.id));
                consumedCount += messages.length;

                if (consumedCount % 1000 === 0) {
                    process.stdout.write('C');
                }
            } catch (err) {
                consumerErrors++;
                console.error('Consumer error:', err.message);
            }

            if (consumedCount >= ITERATIONS) break;
        }
    };

    // Start consumer in background
    const consumerPromise = runConsumer();

    // ===== PRODUCER EXECUTION =====
    monitor.start();
    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    console.log('\nProducing logs (P) and consuming (C)...');

    const promises = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();

        const promise = requestManager.add({ id: `log-pipeline-${i}`, index: i })
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

    // FIX: Force flush BEFORE waiting for promises to avoid deadlock
    const allProcessed = Promise.allSettled(promises);
    await requestManager.forceFlush();
    await allProcessed;

    console.log('\nProducer done. Waiting for consumer to finish...');

    // Wait for consumer with timeout
    const consumerTimeout = setTimeout(() => {
        consumerRunning = false;
    }, 30000);

    await consumerPromise;
    clearTimeout(consumerTimeout);

    // ===== CLEANUP =====
    clearInterval(systemInterval);
    monitor.stop();

    await requestManager.shutdown();
    await producerClient.del('benchmark:pipeline:stream');
    await producerClient.quit();
    await consumerClient.quit();
    await clickhouse.close();

    // ===== RESULTS =====
    console.log('\n\nFull Pipeline Benchmark Complete.');
    console.log(`Consumed: ${consumedCount}/${ITERATIONS} logs`);
    console.log(`Consumer Errors: ${consumerErrors}`);

    const results = monitor.getResults();
    results.pipeline = {
        consumedLogs: consumedCount,
        consumerErrors: consumerErrors,
        description: 'Coalescing → Redis Streams → ClickHouse (full end-to-end)'
    };

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '04-full-pipeline.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
