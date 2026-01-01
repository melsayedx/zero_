const { Worker } = require('worker_threads');
const path = require('path');
const Redis = require('ioredis');
const { createClickHouseClient } = require('../src/infrastructure/database/clickhouse');

// Config
const WORKER_COUNT = 4;
const STREAM_KEY = 'logs:stream';
const GROUP_NAME = 'log-processors';
const EXPECTED_LOGS = parseInt(process.argv[2] || '100000', 10);

async function main() {
    console.log(`Starting Node.js Benchmark with ${WORKER_COUNT} workers...`);
    console.log(`Target: ${EXPECTED_LOGS} logs`);

    // 1. Reset ClickHouse Table
    const clickhouse = createClickHouseClient();
    await clickhouse.command({ query: 'TRUNCATE TABLE logs' });
    console.log('Truncated ClickHouse table: logs');

    // 2. Start Workers
    const workers = [];
    const workerScript = path.join(__dirname, '../src/infrastructure/workers/log-processor.thread.js');

    const startTime = Date.now();

    for (let i = 0; i < WORKER_COUNT; i++) {
        const workerData = {
            workerIndex: i,
            consumerName: `benchmark-node-${i}`,
            workerRole: 'consumer',
            streamKey: STREAM_KEY,
            groupName: GROUP_NAME,
            batchSize: 1000,
            maxBatchSize: 1000,
            maxWaitTime: 500,
            pollInterval: 10, // Aggressive polling for benchmark
            claimMinIdleMs: 10000,
            blockMs: 100,
            clickhouseTable: 'logs'
        };

        const worker = new Worker(workerScript, { workerData });
        workers.push(worker);
    }

    // 3. Monitor Progress
    console.log('Monitoring progress...');
    const monitorInterval = setInterval(async () => {
        try {
            const result = await clickhouse.query({
                query: 'SELECT count() as count FROM logs',
                format: 'JSONEachRow',
            });
            const rows = await result.json();
            const count = parseInt(rows[0].count, 10);

            process.stdout.write(`\rIngested: ${count}/${EXPECTED_LOGS} (${Math.round(count / EXPECTED_LOGS * 100)}%)`);

            if (count >= EXPECTED_LOGS) {
                clearInterval(monitorInterval);
                const duration = (Date.now() - startTime) / 1000;
                console.log(`\n\nDONE!`);
                console.log(`Duration: ${duration.toFixed(3)}s`);
                console.log(`Throughput: ${Math.round(count / duration)} logs/sec`);

                // Cleanup
                workers.forEach(w => w.terminate());
                await clickhouse.close();
                process.exit(0);
            }
        } catch (e) {
            console.error(e);
        }
    }, 1000);
}

main().catch(console.error);
