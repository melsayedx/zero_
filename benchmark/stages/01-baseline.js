require('@dotenvx/dotenvx').config();
const { createClient } = require('@clickhouse/client');
const PerformanceMonitor = require('../lib/PerformanceMonitor');
const path = require('path');
const fs = require('fs');

// Configuration
const ITERATIONS = process.env.BENCHMARK_ITERATIONS || 5000;

/**
 * Stage 01: Baseline - Synchronous ClickHouse Inserts
 * 
 * This is the SLOWEST mode - no optimizations at all.
 * - async_insert DISABLED (wait for every write to complete)
 * - Single log per insert
 * - Sequential processing
 * 
 * This establishes the performance floor for comparison.
 */
async function run() {
    const monitor = new PerformanceMonitor('01-baseline-sync-insert');

    // Create ClickHouse client with SYNC settings (no async_insert)
    const clickhouse = createClient({
        url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
        database: process.env.CLICKHOUSE_DATABASE || 'logs_db',
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        request_timeout: 60000,
        clickhouse_settings: {
            // SYNC MODE: Wait for insert to complete
            async_insert: 0,              // DISABLED - synchronous inserts
            wait_for_async_insert: 1,     // Wait for write confirmation
            insert_deduplicate: 0,        // No deduplication overhead
        }
    });

    // Ensure table exists
    try {
        await clickhouse.command({
            query: `
        CREATE TABLE IF NOT EXISTS logs_benchmark (
          id String,
          app_id String,
          level String,
          message String,
          timestamp DateTime64(3),
          created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (app_id, timestamp)
      `
        });
    } catch (e) {
        console.error('Failed to create table', e);
        process.exit(1);
    }

    console.log(`Starting Baseline Benchmark: ${ITERATIONS} SYNC inserts...`);
    console.log('Mode: async_insert=0 (wait for every write)');

    monitor.start();

    const systemInterval = setInterval(() => {
        monitor.snapshotSystemMetrics();
    }, 100);

    try {
        for (let i = 0; i < ITERATIONS; i++) {
            const start = performance.now();

            // SYNC INSERT: We await and ClickHouse confirms write before returning
            await clickhouse.insert({
                table: 'logs_benchmark',
                values: [{
                    id: `log-baseline-${i}`,
                    app_id: 'benchmark-app',
                    level: 'INFO',
                    message: `Baseline benchmark log entry ${i}`,
                    timestamp: Date.now()
                }],
                format: 'JSONEachRow'
            });

            const duration = performance.now() - start;
            monitor.recordRequest(duration, 0);

            if (i % 500 === 0) process.stdout.write('.');
        }
    } catch (error) {
        console.error('\nBenchmark failed:', error);
    } finally {
        clearInterval(systemInterval);
        monitor.stop();
        await clickhouse.close();
    }

    console.log('\n\nBenchmark Complete.');
    const results = monitor.getResults();
    results.description = 'Baseline: Synchronous ClickHouse inserts (async_insert=0)';

    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, '01-baseline.json');
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

    console.log('Results saved to', outFile);
}

run().catch(console.error);
