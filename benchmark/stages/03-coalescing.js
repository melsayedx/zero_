require('@dotenvx/dotenvx').config();
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const RequestManager = require('../../src/infrastructure/request-processing/request-manager');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;

/**
 * Stage 03: Coalescing + Fire-and-Forget (Cumulative)
 * 
 * Builds on Stage 02 by ADDING request coalescing/batching.
 * - Fire-and-forget: ClickHouse async_insert, don't wait for DB write
 * - Coalescing: Batch multiple requests into single DB insert
 * 
 * This is cumulative: Stage 01 → Stage 02 → Stage 03
 */
async function run() {
    const monitor = new PerformanceMonitor('03-coalescing-plus-fire-and-forget');
    console.log(`Starting Coalescing + Fire-and-Forget Benchmark: ${ITERATIONS} logs...`);
    console.log('This combines: Batching (RequestManager) + Async Insert (no wait)');

    // CLICKHOUSE SETUP (uses async_insert settings from your clickhouse.js)
    const clickhouse = createClickHouseClient();

    // Batch processor - executes when RequestManager flushes
    // Uses FIRE-AND-FORGET: we don't await the actual DB write
    const batchProcessor = async (batch) => {
        try {
            // Transform for ClickHouse insert
            const values = batch.map((item) => ({
                id: `log-coal-ff-${item.i}`,
                app_id: 'benchmark-app',
                level: 'INFO',
                message: `Coalesced + fire-and-forget log entry`,
                timestamp: Date.now()
            }));

            // FIRE-AND-FORGET: Don't await the insert!
            // Just fire the promise and return immediately
            // ClickHouse's async_insert handles buffering internally
            clickhouse.insert({
                table: 'logs_benchmark',
                values,
                format: 'JSONEachRow'
            }).catch(err => {
                // Silently log errors - that's the fire-and-forget tradeoff
                console.error('Background insert failed:', err.message);
            });

            // Return success immediately - we didn't wait for DB
            return batch.map(() => ({ success: true }));

        } catch (error) {
            console.error('Batch processor error:', error);
            return batch.map(() => ({ success: false, error: error.message }));
        }
    };

    // REQUEST MANAGER SETUP
    const requestManager = new RequestManager(batchProcessor, {
        enabled: true,
        maxWaitTime: 50,     // Match project COALESCER_MAX_WAIT_TIME
        maxBatchSize: 5000,  // Match project COALESCER_MAX_BATCH_SIZE
        logger: {
            info: () => { },
            debug: () => { },
            error: console.error
        }
    });

    monitor.start();

    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    // EXECUTION: Fire all requests concurrently
    const promises = [];

    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();

        const promise = requestManager.add({ i })
            .then(() => {
                const duration = performance.now() - start;
                monitor.recordRequest(duration);
            })
            .catch(() => {
                monitor.recordRequest(0, 0, true);
            });

        promises.push(promise);

        if (i % 2000 === 0) process.stdout.write('.');
    }

    // Wait for all coalesced batches to be dispatched
    await Promise.allSettled(promises);
    await requestManager.forceFlush();

    // Give a moment for fire-and-forget writes to complete in background
    console.log('\nWaiting for background writes...');
    await new Promise(r => setTimeout(r, 2000));

    // Cleanup
    await requestManager.shutdown();
    clearInterval(systemInterval);
    monitor.stop();
    await clickhouse.close();

    // SAVE RESULTS
    console.log('\nBenchmark Complete.');
    const results = monitor.getResults();
    results.description = 'Coalescing + Fire-and-Forget (cumulative on Stage 02)';

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '03-coalescing.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
