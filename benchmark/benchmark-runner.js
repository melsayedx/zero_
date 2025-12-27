const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const STAGES = [
    { name: '01-baseline', script: 'stages/01-baseline.js' },
    { name: '02-fire-and-forget', script: 'stages/02-fire-and-forget.js' },
    { name: '03-coalescing', script: 'stages/03-coalescing.js' },
    { name: '04-full-pipeline', script: 'stages/04-redis-streams.js' },
    { name: '05-worker-threads', script: 'stages/05-worker-threads.js' }
];

async function runStage(stage) {
    return new Promise((resolve, reject) => {
        console.log(`\n==================================================`);
        console.log(`RUNNING STAGE: ${stage.name}`);
        console.log(`==================================================\n`);

        const scriptPath = path.join(__dirname, stage.script);
        const child = spawn('node', [scriptPath], {
            stdio: 'inherit',
            env: { ...process.env, BENCHMARK_ITERATIONS: process.env.BENCHMARK_ITERATIONS || '5000' }
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`\n Stage ${stage.name} completed successfully.`);
                resolve();
            } else {
                console.error(`\n Stage ${stage.name} failed with code ${code}.`);
                reject(new Error(`Stage ${stage.name} failed`));
            }
        });

        child.on('error', (err) => {
            console.error(`Failed to start stage ${stage.name}:`, err);
            reject(err);
        });
    });
}

async function main() {
    console.log('🚀 Starting Comprehensive Benchmark Suite');
    console.log('Results will be saved to benchmark/results/');

    // Ensure results dir
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    for (const stage of STAGES) {
        try {
            await runStage(stage);
            // Cool down
            console.log('Cooling down (2s)...');
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            console.error('Benchmark suite paused due to error:', err);
            process.exit(1);
        }
    }

    console.log('\n🎉 All benchmarks completed!');
    console.log('Generating comparison report...');

    // Run report generator
    const reportScript = path.join(__dirname, 'generate-report.js');
    const reportChild = spawn('node', [reportScript], { stdio: 'inherit' });

    reportChild.on('close', (code) => {
        if (code === 0) {
            console.log('Report generated successfully.');
        }
    });
}

main().catch(console.error);
