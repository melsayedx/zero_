/**
 * Log Processor Worker Thread
 *
 * Standalone worker thread script that runs the Redis-to-ClickHouse pipeline
 * in complete isolation from the main HTTP thread.
 *
 * This file is spawned by LogProcessorThreadManager using worker_threads.
 * It has its own event loop, Redis client, and ClickHouse connection.
 */

const { workerData, parentPort } = require('worker_threads');
const { createWorkerRedisClient } = require('../database/redis');

const ClickHouseRepository = require('../persistence/clickhouse.repository');
const RedisRetryStrategy = require('../retry-strategies/redis-retry-strategy');
const RedisStreamQueue = require('../queues/redis-stream-queue');
const BatchBuffer = require('../buffers/batch-buffer');
const { createClickHouseClient } = require('../database/clickhouse');
const { LoggerFactory } = require('../logging');

// Extract configuration from workerData
const {
    workerIndex,
    consumerName,
    workerRole,
    streamKey,
    groupName,
    batchSize,
    maxBatchSize,
    maxWaitTime,
    pollInterval,
    claimMinIdleMs,
    blockMs,
    retryQueueLimit,
    clickhouseTable,
    recoveryIntervalMs
} = workerData;

// Create worker-specific logger
const logger = LoggerFactory.child({ component: `LogProcessorThread-${workerIndex}` });

// Worker state
let isRunning = false;
let isProcessing = false;
let redis = null;
let clickhouseClient = null;
let clickhouseRepository = null;
let retryStrategy = null;
let streamQueue = null;
let batchBuffer = null;

async function initialize() {
    logger.info('Initializing worker thread', { consumerName });

    redis = createWorkerRedisClient(`worker-${workerIndex}`);

    clickhouseClient = createClickHouseClient();

    retryStrategy = new RedisRetryStrategy(redis, {
        queueName: 'clickhouse:dead-letter',
        maxRetries: 3,
        retryDelay: 1000,
        logger: logger.child({ component: 'RetryStrategy' })
    });

    clickhouseRepository = new ClickHouseRepository(clickhouseClient, {
        tableName: clickhouseTable,
        logger: logger.child({ component: 'ClickHouseRepository' })
    });

    streamQueue = new RedisStreamQueue(redis, {
        streamKey,
        groupName,
        consumerName,
        batchSize,
        claimMinIdleMs,
        blockMs,
        logger: logger.child({ component: 'RedisStreamQueue' })
    });

    await streamQueue.initialize();

    batchBuffer = new BatchBuffer(clickhouseRepository, retryStrategy, {
        maxBatchSize,
        maxWaitTime,
        logger: logger.child({ component: 'BatchBuffer' }),
        onFlushSuccess: async (flushedLogs) => {
            await acknowledgeMessages(flushedLogs);
        }
    });

    logger.info('Worker thread initialized', {
        streamKey,
        groupName,
        consumerName,
        batchSize
    });
}

/**
 * Acknowledge messages in Redis after successful DB persistence
 */
async function acknowledgeMessages(flushedLogs) {
    const idsToAck = flushedLogs.map(log => log._redisId);

    if (idsToAck.length === 0) return;

    try {
        await streamQueue.ack(idsToAck);
        logger.debug('Acknowledged messages', { count: idsToAck.length });
    } catch (error) {
        logger.error('Failed to ACK messages', { error: error.message });
    }
}

/**
 * Process own pending messages from previous runs (consumer startup only)
 */
async function processPending() {
    logger.info('Processing own pending messages on startup...');

    let startId = '0-0';
    const pending = await streamQueue.readPending(batchSize, startId);

    if (pending && pending.length > 0) {
        logger.info('Processing own pending messages', { count: pending.length, startId });
        await processMessages(pending);
    }
}

async function processMessages(messages) {
    if (!messages || messages.length === 0) return;

    const logEntries = messages.map(msg => ({ ...msg.data, _redisId: msg.id }));
    if (logEntries.length > 0) {
        // In rare cases where there is a massive batch that exceeds 
        // the buffer size (e.g., 200k logs > 100k buffer), add() recursively
        // calls itself. "await" ensures that all data is successfully buffered 
        // before the worker tries to fetch the next batch.
        await batchBuffer.add(logEntries);
        logger.debug('Buffered messages', { count: logEntries.length });
    }
}

/**
 * Main processing loop for consumer threads
 */
async function processLoop() {
    while (isRunning) {
        try {
            await processBatch();

            if (pollInterval > 0) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        } catch (error) {
            logger.error('Error in process loop', { error: error.message });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

/**
 * Recovery loop for dedicated recovery thread (XAUTOCLAIM only)
 */
async function recoveryLoop() {
    const intervalMs = recoveryIntervalMs;
    logger.info('Starting recovery loop', { intervalMs });

    while (isRunning) {
        try {
            const claimed = await streamQueue.recoverPendingMessages();
            if (claimed && claimed.length > 0) {
                logger.info('Recovery thread claimed stale messages', { count: claimed.length });
                await processMessages(claimed);
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
        } catch (error) {
            logger.error('Error in recovery loop', { error: error.message });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

/**
 * Process a single batch
 */
async function processBatch() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Backpressure check
        try {
            const stats = await retryStrategy.getStats();
            if (stats.queueLength >= retryQueueLimit) {
                logger.warn('Backpressure: Retry queue full', { queueLength: stats.queueLength });
                await new Promise(resolve => setTimeout(resolve, 5000));
                return;
            }
        } catch (statsError) {
            logger.error('Failed to check retry queue stats', { error: statsError.message });
        }

        // Read from Redis Stream (new messages only)
        const messages = await streamQueue.read(batchSize);

        if (!messages || messages.length === 0) {
            return;
        }

        await processMessages(messages);
    } catch (error) {
        logger.error('Batch processing error', { error: error.message });
    } finally {
        isProcessing = false;
    }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    logger.info('Shutting down worker thread...');
    isRunning = false;

    // Wait for current processing
    while (isProcessing) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    await batchBuffer.shutdown();
    await streamQueue.shutdown();
    await redis.quit();
    await clickhouseClient.close();

    logger.info('Worker thread shutdown complete');
}

function getHealth() {
    return {
        isRunning,
        isProcessing,
        consumerName,
        workerRole,
        buffer: batchBuffer ? batchBuffer.getHealth() : null
    };
}

// Handle messages from parent
parentPort.on('message', async (message) => {
    const { type, requestId } = message;

    try {
        switch (type) {
            case 'shutdown':
                await shutdown();
                parentPort.postMessage({ type: 'shutdown_complete', requestId });
                process.exit(0);
                break;

            case 'health':
                parentPort.postMessage({
                    type: 'health_response',
                    requestId,
                    data: getHealth()
                });
                break;

            default:
                logger.warn('Unknown message type', { type });
        }
    } catch (error) {
        logger.error('Error handling message', { type, error: error.message });
        parentPort.postMessage({
            type: 'error',
            requestId,
            error: error.message
        });
    }
});

// Start the worker
(async () => {
    try {
        await initialize();
        isRunning = true;

        // Signal ready to parent
        parentPort.postMessage({ type: 'ready', consumerName, workerRole });

        if (workerRole === 'recovery') {
            // Recovery thread: dedicated XAUTOCLAIM loop only
            logger.info('Starting as recovery thread');
            await recoveryLoop();
        } else {
            // Consumer thread: process own pending then read new messages
            logger.info('Starting as consumer thread');
            await processPending();
            await processLoop();
        }
    } catch (error) {
        logger.error('Worker thread fatal error', { error: error.message });
        parentPort.postMessage({ type: 'error', error: error.message });
        process.exit(1);
    }
})();
