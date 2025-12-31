/**
 * HTTP Network Overhead Benchmark
 * 
 * Tests HTTP/1.1 vs HTTP/2 network overhead with configurable workloads.
 * Measures actual network latency, connection reuse, and multiplexing benefits.
 * 
 * Usage:
 *   HTTP/1: node benchmark/network/http-benchmark.js --http1 --light
 *   HTTP/2: node benchmark/network/http-benchmark.js --http2 --intensive
 */

const http = require('http');
const https = require('https');
const http2 = require('http2');
const fs = require('fs');
const path = require('path');
const PerformanceMonitor = require('../lib/PerformanceMonitor');

// Parse CLI arguments
const args = process.argv.slice(2);
const useHttp2 = args.includes('--http2');
const isIntensive = args.includes('--intensive');
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || (isIntensive ? '100' : '10'));

// Workload configuration
const WORKLOADS = {
    light: {
        totalRequests: 1000,
        concurrency: 10,
        batchSizes: [1, 10],           // Small batches
        payloadMultiplier: 1
    },
    intensive: {
        totalRequests: 10000,
        concurrency: 100,
        batchSizes: [50, 100, 500],    // Large batches
        payloadMultiplier: 10
    }
};

const workload = isIntensive ? WORKLOADS.intensive : WORKLOADS.light;
const effectiveConcurrency = concurrency || workload.concurrency;

// Server configuration
const HTTP1_PORT = process.env.PORT || 3000;
const HTTP2_PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Generate log payload
function generateLogPayload(count = 1) {
    const logs = [];
    for (let i = 0; i < count; i++) {
        logs.push({
            app_id: 'benchmark-network',
            level: ['INFO', 'WARN', 'ERROR', 'DEBUG'][Math.floor(Math.random() * 4)],
            message: `Network benchmark log entry ${Date.now()}-${i} with some additional data to simulate realistic payload size`,
            metadata: {
                requestId: `req-${Date.now()}-${i}`,
                userId: `user-${Math.floor(Math.random() * 1000)}`,
                action: 'benchmark_test',
                timestamp: new Date().toISOString()
            }
        });
    }
    return logs.length === 1 ? logs[0] : logs;
}

// HTTP/1.1 Request
function makeHttp1Request(payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
            hostname: HOST,
            port: HTTP1_PORT,
            path: '/api/logs',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const start = performance.now();
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = performance.now() - start;
                resolve({
                    duration,
                    statusCode: res.statusCode,
                    bytes: Buffer.byteLength(data) + body.length
                });
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// HTTP/2 Client (persistent connection)
let http2Client = null;
function getHttp2Client() {
    if (!http2Client) {
        http2Client = http2.connect(`https://${HOST}:${HTTP2_PORT}`, {
            rejectUnauthorized: false // For self-signed certs
        });
        http2Client.on('error', (err) => {
            console.error('HTTP/2 connection error:', err.message);
            http2Client = null;
        });
    }
    return http2Client;
}

function makeHttp2Request(payload) {
    return new Promise((resolve, reject) => {
        const client = getHttp2Client();
        const data = JSON.stringify(payload);
        const start = performance.now();

        const req = client.request({
            ':method': 'POST',
            ':path': '/api/logs',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(data)
        });

        let body = '';
        req.on('response', (headers) => {
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const duration = performance.now() - start;
                resolve({
                    duration,
                    statusCode: headers[':status'],
                    bytes: Buffer.byteLength(data) + body.length
                });
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Run concurrent requests
async function runConcurrentBatch(makeRequest, payload, count, maxConcurrent) {
    const results = [];
    const pending = [];

    for (let i = 0; i < count; i++) {
        const promise = makeRequest(payload)
            .then(result => results.push({ ...result, success: true }))
            .catch(err => results.push({ success: false, error: err.message, duration: 0, bytes: 0 }));

        pending.push(promise);

        // Limit concurrency
        if (pending.length >= maxConcurrent) {
            await Promise.race(pending);
            // Remove completed promises
            for (let j = pending.length - 1; j >= 0; j--) {
                if (pending[j].isResolved) pending.splice(j, 1);
            }
        }
    }

    await Promise.all(pending);
    return results;
}

// Main benchmark
async function runBenchmark() {
    const protocol = useHttp2 ? 'HTTP/2' : 'HTTP/1.1';
    const intensity = isIntensive ? 'INTENSIVE' : 'LIGHT';
    const stageName = `network-${protocol.toLowerCase().replace('/', '')}-${intensity.toLowerCase()}`;

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log(`║  Network Overhead Benchmark: ${protocol.padEnd(8)} ${intensity.padEnd(10)}     ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Configuration:`);
    console.log(`  Protocol:    ${protocol}`);
    console.log(`  Intensity:   ${intensity}`);
    console.log(`  Requests:    ${workload.totalRequests}`);
    console.log(`  Concurrency: ${effectiveConcurrency}`);
    console.log(`  Batch sizes: ${workload.batchSizes.join(', ')}\n`);

    const monitor = new PerformanceMonitor(stageName);
    const makeRequest = useHttp2 ? makeHttp2Request : makeHttp1Request;

    // Results per batch size
    const batchResults = {};

    for (const batchSize of workload.batchSizes) {
        console.log(`\n--- Testing batch size: ${batchSize} logs per request ---`);

        const requestsForBatch = Math.floor(workload.totalRequests / workload.batchSizes.length);
        const payload = generateLogPayload(batchSize);

        monitor.start();
        const systemInterval = setInterval(() => monitor.snapshotSystemMetrics(), 100);

        const results = [];
        let completed = 0;

        // Run in concurrent waves
        const waveSize = effectiveConcurrency;
        const waves = Math.ceil(requestsForBatch / waveSize);

        for (let wave = 0; wave < waves; wave++) {
            const waveRequests = Math.min(waveSize, requestsForBatch - completed);
            const wavePromises = [];

            for (let i = 0; i < waveRequests; i++) {
                const start = performance.now();
                wavePromises.push(
                    makeRequest(payload)
                        .then(result => {
                            monitor.recordRequest(result.duration, result.bytes);
                            results.push(result);
                        })
                        .catch(err => {
                            monitor.recordRequest(0, 0, true);
                            results.push({ success: false, error: err.message });
                        })
                );
            }

            await Promise.all(wavePromises);
            completed += waveRequests;

            if (completed % 500 === 0 || completed === requestsForBatch) {
                process.stdout.write(`\r  Progress: ${completed}/${requestsForBatch}`);
            }
        }

        clearInterval(systemInterval);
        monitor.stop();

        const successCount = results.filter(r => r.success !== false).length;
        const failCount = results.filter(r => r.success === false).length;

        batchResults[batchSize] = {
            requests: requestsForBatch,
            logsPerRequest: batchSize,
            totalLogs: requestsForBatch * batchSize,
            successRate: (successCount / results.length * 100).toFixed(2) + '%',
            ...monitor.getResults()
        };

        console.log(`\n  Success: ${successCount}/${results.length} (${failCount} failed)`);
    }

    // Close HTTP/2 connection
    if (http2Client) {
        http2Client.close();
        http2Client = null;
    }

    // Aggregate results
    const aggregatedResults = {
        protocol,
        intensity,
        workload,
        concurrency: effectiveConcurrency,
        batchResults,
        timestamp: new Date().toISOString()
    };

    // Save results
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const outFile = path.join(resultsDir, `${stageName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(aggregatedResults, null, 2));

    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('                      RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const [batchSize, result] of Object.entries(batchResults)) {
        console.log(`Batch Size: ${batchSize} logs/request`);
        console.log(`  Throughput:  ${result.throughput.requestsPerSec.toFixed(2)} req/s`);
        console.log(`  Logs/sec:    ${(result.throughput.requestsPerSec * batchSize).toFixed(2)}`);
        console.log(`  Latency P50: ${result.latency.p50.toFixed(2)}ms`);
        console.log(`  Latency P99: ${result.latency.p99.toFixed(2)}ms`);
        console.log();
    }

    console.log(`Results saved to: ${outFile}`);
}

// Check if server is running
async function checkServer() {
    return new Promise((resolve) => {
        const protocol = useHttp2 ? https : http;
        const options = {
            hostname: HOST,
            port: useHttp2 ? HTTP2_PORT : HTTP1_PORT,
            path: '/health',
            method: 'GET',
            rejectUnauthorized: false
        };

        const req = protocol.request(options, (res) => {
            resolve(true);
        });

        req.on('error', () => {
            console.error(`\n❌ Server not running at ${HOST}:${useHttp2 ? HTTP2_PORT : HTTP1_PORT}`);
            console.log('\nStart the server first:');
            console.log(useHttp2
                ? '  ENABLE_HTTP2=true npm run dev'
                : '  npm run dev');
            resolve(false);
        });

        req.end();
    });
}

// Entry point
async function main() {
    const serverOk = await checkServer();
    if (!serverOk) {
        process.exit(1);
    }

    try {
        await runBenchmark();
    } catch (err) {
        console.error('Benchmark failed:', err);
        process.exit(1);
    }
}

main();
