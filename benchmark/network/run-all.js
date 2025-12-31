#!/usr/bin/env node
/**
 * Run All Network Benchmarks
 * 
 * Runs HTTP/1 and HTTP/2 benchmarks with both light and intensive workloads,
 * then generates a comparison report.
 * 
 * Prerequisites:
 *   1. Start HTTP/1 server:  npm run dev
 *   2. Stop it, then start HTTP/2 server: ENABLE_HTTP2=true npm run dev
 *   
 * Or use this script which handles server restarts automatically.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BENCHMARK_SCRIPT = path.join(__dirname, 'http-benchmark.js');
const RESULTS_DIR = path.join(__dirname, '../results');

// Benchmark configurations
const BENCHMARKS = [
    { name: 'HTTP/1.1 Light', args: ['--http1', '--light'] },
    { name: 'HTTP/1.1 Intensive', args: ['--http1', '--intensive'] },
    { name: 'HTTP/2 Light', args: ['--http2', '--light'] },
    { name: 'HTTP/2 Intensive', args: ['--http2', '--intensive'] }
];

async function runBenchmark(config) {
    return new Promise((resolve, reject) => {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`Running: ${config.name}`);
        console.log(`${'═'.repeat(60)}\n`);

        const child = spawn('node', [BENCHMARK_SCRIPT, ...config.args], {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${config.name} failed with code ${code}`));
            }
        });

        child.on('error', reject);
    });
}

function generateComparisonReport() {
    console.log('\n' + '═'.repeat(60));
    console.log('               NETWORK BENCHMARK COMPARISON');
    console.log('═'.repeat(60) + '\n');

    const results = {};

    // Load all network benchmark results
    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith('network-'));

    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
        const key = `${data.protocol}-${data.intensity}`;
        results[key] = data;
    }

    // Print comparison table
    console.log('┌────────────────┬──────────┬────────────┬───────────┬───────────┐');
    console.log('│ Configuration  │ Batch    │ Throughput │ P50 (ms)  │ P99 (ms)  │');
    console.log('├────────────────┼──────────┼────────────┼───────────┼───────────┤');

    for (const [key, data] of Object.entries(results)) {
        for (const [batchSize, batch] of Object.entries(data.batchResults)) {
            const config = `${data.protocol} ${data.intensity}`.substring(0, 14).padEnd(14);
            const batchStr = batchSize.padStart(8);
            const throughput = batch.throughput.requestsPerSec.toFixed(1).padStart(10);
            const p50 = batch.latency.p50.toFixed(2).padStart(9);
            const p99 = batch.latency.p99.toFixed(2).padStart(9);

            console.log(`│ ${config} │ ${batchStr} │ ${throughput} │ ${p50} │ ${p99} │`);
        }
    }

    console.log('└────────────────┴──────────┴────────────┴───────────┴───────────┘');

    // Calculate HTTP/2 vs HTTP/1 improvement
    if (results['HTTP/2-INTENSIVE'] && results['HTTP/1.1-INTENSIVE']) {
        console.log('\n📊 HTTP/2 vs HTTP/1.1 Comparison (Intensive Workload):');

        const h2 = results['HTTP/2-INTENSIVE'];
        const h1 = results['HTTP/1.1-INTENSIVE'];

        for (const batchSize of Object.keys(h2.batchResults)) {
            if (h1.batchResults[batchSize]) {
                const h2Throughput = h2.batchResults[batchSize].throughput.requestsPerSec;
                const h1Throughput = h1.batchResults[batchSize].throughput.requestsPerSec;
                const improvement = ((h2Throughput - h1Throughput) / h1Throughput * 100).toFixed(1);

                const h2P99 = h2.batchResults[batchSize].latency.p99;
                const h1P99 = h1.batchResults[batchSize].latency.p99;
                const latencyImprovement = ((h1P99 - h2P99) / h1P99 * 100).toFixed(1);

                console.log(`\n  Batch size ${batchSize}:`);
                console.log(`    Throughput: ${improvement > 0 ? '+' : ''}${improvement}% ${improvement > 0 ? '(HTTP/2 faster)' : '(HTTP/1.1 faster)'}`);
                console.log(`    P99 Latency: ${latencyImprovement > 0 ? '-' : '+'}${Math.abs(latencyImprovement)}% ${latencyImprovement > 0 ? '(HTTP/2 lower)' : '(HTTP/1.1 lower)'}`);
            }
        }
    }

    // Save comparison report
    const reportPath = path.join(RESULTS_DIR, 'network-comparison.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n✅ Full comparison saved to: ${reportPath}`);
}

async function main() {
    console.log('🚀 Network Overhead Benchmark Suite\n');
    console.log('This will run HTTP/1.1 and HTTP/2 benchmarks with light and intensive workloads.');
    console.log('Make sure the appropriate server is running before each test.\n');

    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }

    // Run HTTP/1.1 benchmarks first
    console.log('📡 Phase 1: HTTP/1.1 Benchmarks');
    console.log('   Ensure server is running: npm run dev\n');

    try {
        await runBenchmark(BENCHMARKS[0]); // HTTP/1 Light
        await new Promise(r => setTimeout(r, 2000)); // Cool down
        await runBenchmark(BENCHMARKS[1]); // HTTP/1 Intensive
    } catch (err) {
        console.error('HTTP/1.1 benchmarks failed:', err.message);
        console.log('Continuing to HTTP/2 benchmarks...');
    }

    console.log('\n\n📡 Phase 2: HTTP/2 Benchmarks');
    console.log('   Ensure server is running: ENABLE_HTTP2=true npm run dev\n');

    try {
        await runBenchmark(BENCHMARKS[2]); // HTTP/2 Light
        await new Promise(r => setTimeout(r, 2000)); // Cool down
        await runBenchmark(BENCHMARKS[3]); // HTTP/2 Intensive
    } catch (err) {
        console.error('HTTP/2 benchmarks failed:', err.message);
    }

    // Generate comparison report
    generateComparisonReport();

    console.log('\n🎉 All benchmarks completed!');
}

main().catch(console.error);
