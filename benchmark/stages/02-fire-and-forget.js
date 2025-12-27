require('@dotenvx/dotenvx').config();
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;

async function run() {
    const monitor = new PerformanceMonitor('02-fire-and-forget');

    // Setup ClickHouse - check env vars in clickhouse.js to ensure async_insert is ON
    // In our createClickHouseClient, we set:
    // async_insert: 1
    // wait_for_async_insert: 0  <-- This is the key for fire-and-forget
    const clickhouse = createClickHouseClient();

    console.log(`Starting Fire-and-Forget Benchmark: ${ITERATIONS} inserts...`);

    monitor.start();

    // System monitoring
    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    try {
        const promises = [];

        // TRUE Fire-and-Forget: We DON'T await each insert
        // We fire the promise and immediately continue to the next iteration
        // This measures how fast we can DISPATCH requests, not wait for responses

        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();

            // Fire the insert WITHOUT awaiting - this is TRUE fire-and-forget
            const promise = clickhouse.insert({
                table: 'logs_benchmark',
                values: [{
                    id: `log-ff-${i}`,
                    app_id: 'benchmark-app',
                    level: 'INFO',
                    message: `Benchmark log entry ${i} - fire-and-forget`,
                    timestamp: Date.now()
                }],
                format: 'JSONEachRow'
            }).catch(err => {
                // Silently catch errors - that's the fire-and-forget tradeoff
                monitor.recordRequest(0, 0, true); // Record as error
            });

            promises.push(promise);

            const duration = performance.now() - start;
            monitor.recordRequest(duration, 0);

            if (i % 1000 === 0) process.stdout.write('.');
        }

        // Wait for all promises to settle before closing connection
        // This is NOT part of the "request latency" - it's just cleanup
        console.log('\nWaiting for in-flight requests to complete...');
        await Promise.allSettled(promises);
    } catch (error) {
        console.error('\nBenchmark failed:', error);
    } finally {
        clearInterval(systemInterval);
        monitor.stop();
        await clickhouse.close();
    }

    console.log('\n\nBenchmark Complete.');
    const results = monitor.getResults();

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '02-fire-and-forget.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
