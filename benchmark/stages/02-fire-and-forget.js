require('@dotenvx/dotenvx').config();
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;

/**
 * Simple synchronous validation (like the project's SyncValidationStrategy)
 * Validates log structure before accepting
 */
function validateLog(log) {
    // Basic validation - similar to what SyncValidationStrategy does
    if (!log.app_id || typeof log.app_id !== 'string' || log.app_id.length === 0) {
        throw new Error('app_id is required');
    }
    if (!log.level || !['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(log.level)) {
        throw new Error('Invalid log level');
    }
    if (!log.message || typeof log.message !== 'string') {
        throw new Error('message is required');
    }
    return { valid: true, normalized: log };
}

async function run() {
    const monitor = new PerformanceMonitor('02-fire-and-forget');

    // Setup ClickHouse - check env vars in clickhouse.js to ensure async_insert is ON
    // In our createClickHouseClient, we set:
    // async_insert: 1
    // wait_for_async_insert: 0  <-- This is the key for fire-and-forget
    const clickhouse = createClickHouseClient();

    console.log(`Starting Fire-and-Forget Benchmark: ${ITERATIONS} inserts...`);
    console.log('Flow: Validate → Fire-and-Forget Insert (no wait for DB confirmation)');

    monitor.start();

    // System monitoring
    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    try {
        const promises = [];

        // Fire-and-Forget with Validation:
        // 1. Validate the log (SYNC - client waits for this)
        // 2. Fire the insert (ASYNC - client does NOT wait)
        // This ensures data is valid before accepting, but doesn't wait for DB write

        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();

            // Create log entry
            const logEntry = {
                id: `log-ff-${i}`,
                app_id: 'benchmark-app',
                level: 'INFO',
                message: `Benchmark log entry ${i} - fire-and-forget`,
                timestamp: Date.now()
            };

            try {
                // STEP 1: Validate (sync - client waits for this)
                validateLog(logEntry);

                // STEP 2: Fire the insert WITHOUT awaiting
                // Client gets response HERE - after validation, before DB write
                const promise = clickhouse.insert({
                    table: 'logs_benchmark',
                    values: [logEntry],
                    format: 'JSONEachRow'
                }).catch(err => {
                    // Background errors are logged but not returned to client
                    // This is the fire-and-forget tradeoff
                });

                promises.push(promise);

                const duration = performance.now() - start;
                monitor.recordRequest(duration, 0);

            } catch (validationError) {
                // Validation errors ARE returned to client
                monitor.recordRequest(0, 0, true);
            }

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
    results.description = 'Fire-and-Forget: Validate (sync) → Insert (async, no wait)';

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '02-fire-and-forget.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
