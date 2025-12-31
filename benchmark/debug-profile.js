const fs = require('fs');
const path = require('path');
const DIContainer = require('../src/infrastructure/config/di-container');

// Force silent logging
process.env.LOG_MODE = 'silent';
// Mock environment if needed
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';

async function runProfile() {
    console.log('Initializing DI Container...');
    const container = new DIContainer();
    await container.initialize();

    const controller = container.get('ingestLogController');

    // Load payload
    const payloadPath = path.join(__dirname, 'http/payloads', 'batch-100.json');
    const rawBody = fs.readFileSync(payloadPath, 'utf8');
    const body = JSON.parse(rawBody); // Pre-parse to test Controller logic, not JSON.parse speed (Fastify does that)

    console.log(`Payload size: ${body.length} logs`);

    // Mock Request/Reply
    const req = { body };
    const reply = {
        code: () => reply,
        send: () => reply
    };

    const ITERATIONS = 2000;
    console.log(`Starting profile: ${ITERATIONS} iterations...`);

    const start = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
        await controller.handle(req, reply);
    }

    const end = process.hrtime.bigint();
    const durationNs = end - start;
    const durationSec = Number(durationNs) / 1e9;

    const totalLogs = ITERATIONS * body.length;
    const logsPerSec = totalLogs / durationSec;
    const reqPerSec = ITERATIONS / durationSec;

    console.log('\nResults:');
    console.log(`Duration: ${durationSec.toFixed(3)}s`);
    console.log(`Throughput (Req/s):  ${reqPerSec.toFixed(0)}`);
    console.log(`Throughput (Logs/s): ${logsPerSec.toFixed(0)}`);

    await container.cleanup();
}

runProfile().catch(console.error);
