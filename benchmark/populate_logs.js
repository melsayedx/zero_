#!/usr/bin/env node
/**
 * Populate Redis Stream with test logs for C++ ingester benchmark
 * 
 * Usage: node populate-redis.js [count]
 * Default count: 50000
 */

require('@dotenvx/dotenvx').config();
const Redis = require('ioredis');

const COUNT = parseInt(process.argv[2] || '50000', 10);
const STREAM_KEY = process.env.STREAM_KEY || 'logs:stream';
const BATCH_SIZE = 1000;

async function main() {
    console.log('==========================================');
    console.log(' Redis Stream Populator for C++ Benchmark');
    console.log('==========================================');
    console.log(`Stream: ${STREAM_KEY}`);
    console.log(`Count: ${COUNT} logs`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log('');

    const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        lazyConnect: true
    });

    await redis.connect();
    console.log('Connected to Redis');

    // Create consumer group if not exists
    try {
        await redis.xgroup('CREATE', STREAM_KEY, 'log-processors', '$', 'MKSTREAM');
        console.log('Created consumer group: log-processors');
    } catch (err) {
        if (!err.message.includes('BUSYGROUP')) throw err;
        console.log('Consumer group already exists');
    }

    console.log('\nPopulating stream...');
    const startTime = Date.now();

    let added = 0;
    while (added < COUNT) {
        const batchCount = Math.min(BATCH_SIZE, COUNT - added);
        const pipeline = redis.pipeline();

        for (let i = 0; i < batchCount; i++) {
            const idx = added + i;
            const logEntry = {
                appId: 'benchmark-cpp',
                message: `Test log entry ${idx} - Lorem ipsum dolor sit amet`,
                source: 'populate-script',
                level: ['INFO', 'DEBUG', 'WARN', 'ERROR'][idx % 4],
                environment: 'benchmark',
                metadataString: JSON.stringify({ index: idx, timestamp: Date.now() }),
                traceId: `trace-${idx}`,
                userId: `user-${idx % 100}`
            };

            pipeline.xadd(
                STREAM_KEY,
                'MAXLEN', '~', '1000000',
                '*',
                'data', JSON.stringify(logEntry)
            );
        }

        await pipeline.exec();
        added += batchCount;

        // Progress
        if (added % 10000 === 0 || added === COUNT) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(added / elapsed);
            console.log(`  Added: ${added}/${COUNT} (${rate} logs/sec)`);
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const streamLen = await redis.xlen(STREAM_KEY);

    console.log('\n==========================================');
    console.log(' Complete!');
    console.log('==========================================');
    console.log(`Added: ${COUNT} logs in ${totalTime.toFixed(2)}s`);
    console.log(`Rate: ${Math.round(COUNT / totalTime)} logs/sec`);
    console.log(`Stream length: ${streamLen}`);
    console.log('');
    console.log('Now run the C++ benchmark:');
    console.log('  ./cpp-ingester/build/clickhouse_ingester --benchmark --count ' + COUNT);

    await redis.quit();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
