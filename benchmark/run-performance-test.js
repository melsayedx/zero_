const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const colors = require('colors');

const PORT = 3000;
const CLUSTER_WORKERS = process.env.CLUSTER_WORKERS || 4; // Use 4 workers for stable local benchmarking

console.log(colors.cyan('='.repeat(60)));
console.log(colors.bold(`Running Scalability Benchmark (Cluster Mode: ${CLUSTER_WORKERS} workers)`));
console.log(colors.cyan('='.repeat(60)));

async function killPort(port) {
    try {
        execSync(`lsof -t -i:${port} | xargs kill -9`, { stdio: 'ignore' });
        console.log(colors.grey(`• Port ${port} cleared.`));
    } catch (e) {
        // Ignore if nothing killed
    }
}

async function run() {
    // 1. Cleanup
    await killPort(PORT);

    // 2. Start Cluster
    console.log(colors.yellow('• Starting Server in Cluster Mode...'));
    const server = spawn('node', ['src/app.js'], {
        env: {
            ...process.env,
            NODE_ENV: 'production',
            LOG_MODE: 'silent',
            ENABLE_CLUSTERING: 'true',
            CLUSTER_WORKERS: CLUSTER_WORKERS,
            ENABLE_WORKER_VALIDATION: 'false' // Disable internal threads to reduce context switching storm
        },
        stdio: 'inherit' // Pipe output to see startup logs if any
    });

    let serverPid = server.pid;

    // Allow time for workers to fork and come online
    console.log(colors.yellow('• Waiting 5s for workers to initialize...'));
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // 3. Run Benchmark
        console.log(colors.bold('\n>>> Starting Autocannon Benchmark <<<\n'));
        const benchmark = spawn('node', ['benchmark/http/autocannon-runner.js', '--batch=100', '--protocol=http1'], {
            env: {
                ...process.env,
                BENCH_DURATION: 30,
                BENCH_CONNECTIONS: 40, // Reduced from 200 to avoid thundering herd on local machine
                BENCH_PIPELINING: 2    // Reduced from 10
            },
            stdio: 'inherit'
        });

        await new Promise((resolve, reject) => {
            benchmark.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`Benchmark failed with code ${code}`));
            });
        });

    } catch (err) {
        console.error(colors.red('Benchmark failed:'), err);
    } finally {
        // 4. Cleanup
        console.log(colors.yellow('\n• Stopping Server...'));
        server.kill('SIGINT');
        // Ensure everything is dead
        await new Promise(r => setTimeout(r, 1000));
        await killPort(PORT);
        console.log(colors.green('• Done.'));
        process.exit(0);
    }
}

run();
