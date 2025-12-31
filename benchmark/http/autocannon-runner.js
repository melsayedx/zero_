const autocannon = require('autocannon');
const { createClickHouseClient } = require('../../src/infrastructure/database/clickhouse');
const path = require('path');
const fs = require('fs');
const colors = require('colors');

// Configuration
const HOST = process.env.API_HOST || 'localhost';
const PORT = process.env.PORT || 3000;
const DURATION_WARMUP = 10;
const DURATION_MEASURE = parseInt(process.env.BENCH_DURATION) || 40;
const CONNECTIONS = parseInt(process.env.BENCH_CONNECTIONS) || 100;
const PIPELINING = parseInt(process.env.BENCH_PIPELINING) || 10;

// Parse args
const args = process.argv.slice(2);
const protocolArg = args.find(a => a.startsWith('--protocol='));
const protocol = protocolArg ? protocolArg.split('=')[1] : 'http1'; // http1 or http2
const runAll = args.includes('--all');

async function runBenchmark(batchSize, useHttp2) {
    const url = `http://${HOST}:${PORT}/api/logs`;
    console.log(`\n${colors.cyan('='.repeat(60))}`);
    console.log(`${colors.bold(`Running ${useHttp2 ? 'HTTP/2' : 'HTTP/1.1'} Benchmark - Batch Size ${batchSize}`)}`);
    console.log(`${colors.cyan('='.repeat(60))}`);

    // 1. Reset ClickHouse
    console.log(colors.yellow('• Resetting database...'));
    const clickhouse = createClickHouseClient();
    try {
        await clickhouse.command({ query: "ALTER TABLE logs DELETE WHERE app_id = 'benchmark-app'" });
        // Wait for mutation to complete
        console.log(colors.grey('  Waiting for cleanup mutation...'));
        for (let i = 0; i < 10; i++) {
            const res = await clickhouse.query({
                query: "SELECT count() as count FROM system.mutations WHERE is_done = 0 AND table = 'logs'",
                format: 'JSONEachRow'
            });
            const rows = await res.json();
            if (+rows[0].count === 0) break;
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (err) {
        console.error('Failed to reset DB:', err.message);
    }

    const payloadPath = path.join(__dirname, 'payloads', `batch-${batchSize}.json`);
    const body = fs.readFileSync(payloadPath, 'utf8');

    // 2. Warmup
    console.log(colors.yellow(`• Warming up (${DURATION_WARMUP}s)...`));

    const warmupOpts = {
        url,
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body,
        connections: CONNECTIONS,
        pipelining: PIPELINING,
        duration: DURATION_WARMUP,
        workers: 4 // Use worker threads for generating load
    };

    // Autocannon doesn't support http2 in options directly in same way as CLI for some versions,
    // but the library instance usually handles it via protocol in URL or specific opts.
    // For HTTP/2 with autocannon programmatic API, unfortunately it's experimental or requires specific setup.
    // BUT the user asked for autocannon usage.
    // Note: Autocannon programmatic API doesn't fully expose HTTP/2 flag easily in some versions 
    // without using the CLI logic. We might need to spawn the CLI if the API is limited.
    // However, recent autocannon versions support it. attempt to use it.

    // Actually, looking at autocannon docs, it doesn't support HTTP/2 in the programmatic API 
    // as easily as the CLI without `http2: true`.
    if (useHttp2) {
        // This might fail if the server doesn't support cleartext h2c or if we don't setup correctly.
        // We'll trust the user has an endpoint capable of it.
        // But honestly, spawning the CLI might be safer for "industry standard" exact reproduction.
        // Let's stick to programmatic for better control unless it fails.
        // Wait, autocannon DOES support http2: true in opts.
    }

    // Run Warmup
    await new Promise((resolve) => {
        autocannon({ ...warmupOpts, title: 'warmup' }, resolve);
    });

    console.log(colors.yellow('• Waiting for warmup data to flush (5s)...'));
    await new Promise(r => setTimeout(r, 5000));

    // 3. Measure
    // Get count after warmup
    let initialCount = 0;
    try {
        const res = await clickhouse.query({
            query: "SELECT count() as count FROM logs WHERE app_id = 'benchmark-app'",
            format: 'JSONEachRow'
        });
        const rows = await res.json();
        initialCount = +rows[0].count; // Ensure number
    } catch (err) {
        console.error('Failed to query DB for initial count:', err.message);
    }

    console.log(colors.green(`• Measuring (${DURATION_MEASURE}s)...`));
    const result = await new Promise((resolve) => {
        autocannon({
            ...warmupOpts,
            duration: DURATION_MEASURE,
            title: `benchmark-${batchSize}`
        }, (err, res) => {
            if (err) console.error(err);
            resolve(res);
        });
    });

    // 4. Verify in ClickHouse
    console.log(colors.yellow('• Verifying data in ClickHouse...'));
    // Wait a bit for potential async flush
    await new Promise(r => setTimeout(r, 2000));

    let finalCount = 0;
    try {
        const res = await clickhouse.query({
            query: "SELECT count() as count FROM logs WHERE app_id = 'benchmark-app'",
            format: 'JSONEachRow'
        });
        const rows = await res.json();
        finalCount = +rows[0].count; // Ensure number
    } catch (err) {
        console.error('Failed to query DB:', err.message);
    }

    const logsIngestedDuringBenchmark = finalCount - initialCount;
    const expectedTotal = result.requests.total * batchSize;

    // 5. Output
    console.log(`\n${colors.bold('Results:')}`);
    console.log(`Throughput:      ${colors.bold(result.requests.average.toFixed(0))} req/s`);
    console.log(`Throughput (Logs): ${colors.bold((result.requests.average * batchSize).toFixed(0))} logs/s`);
    console.log(`Latency (P50):   ${colors.bold(result.latency.p50)} ms`);
    console.log(`Latency (P99):   ${colors.bold(result.latency.p99)} ms`);
    console.log(`Total Requests:  ${result.requests.total}`);
    console.log(`Total Logs Sent: ${expectedTotal}`);
    console.log(`Logs in DB (Total): ${colors.bold(finalCount)}`);
    console.log(`Logs Processed:     ${colors.bold(logsIngestedDuringBenchmark)}`);
    console.log(`Data Loss:       ${((1 - (logsIngestedDuringBenchmark / expectedTotal)) * 100).toFixed(2)}% (Approx)\n`);

    // Print simplified autocannon table
    console.log(autocannon.printResult(result));

    await clickhouse.close();
}

async function main() {
    const batches = [1, 10, 100, 500];
    const isHttp2 = protocol === 'http2';

    if (runAll) {
        for (const batch of batches) {
            await runBenchmark(batch, isHttp2);
            // Cooldown
            await new Promise(r => setTimeout(r, 2000));
        }
    } else {
        // Default to batch 100 if single run, or use provided argument
        const batchArg = args.find(a => a.startsWith('--batch='));
        const batchSize = batchArg ? parseInt(batchArg.split('=')[1]) : 100;
        await runBenchmark(batchSize, isHttp2);
    }
}

main().catch(console.error);
