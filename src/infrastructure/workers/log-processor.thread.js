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
const Redis = require('ioredis');

// Import required classes
const ClickHouseRepository = require('../../interfaces/persistence/clickhouse.repository');
const RedisRetryStrategy = require('../retry-strategies/redis-retry-strategy');
const RedisStreamQueue = require('../queues/redis-stream-queue');
const BatchBuffer = require('../buffers/batch-buffer');
const { createClickHouseClient } = require('../database/clickhouse');
const { LoggerFactory } = require('../logging');

// Extract configuration from workerData
const {
    workerIndex,
    consumerName,
    redisConfig,
    streamKey,
    groupName,
    batchSize,
    maxBatchSize,
    maxWaitTime,
    pollInterval,
    claimMinIdleMs,
    retryQueueLimit,
    clickhouseTable
} = workerData;

// Create worker-specific logger
const logger = LoggerFactory.named(`LogProcessorThread-${workerIndex}`);

// Worker state
let isRunning = false;
let isProcessing = false;
let redis = null;
let clickhouseClient = null;
let clickhouseRepository = null;
let retryStrategy = null;
let streamQueue = null;
let batchBuffer = null;

/**
 * Initialize all dependencies for this worker thread
 */
async function initialize() {
    logger.info('Initializing worker thread', { consumerName });

    // Reconstruct full Redis config with non-serializable functions
    // (Functions cannot be passed via workerData)
    const fullRedisConfig = {
        ...redisConfig,
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        reconnectOnError: (err) => {
            if (err.message.includes('READONLY')) {
                return true;
            }
        }
    };

    // Create dedicated Redis client for this worker
    redis = new Redis(fullRedisConfig);
    redis.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
    });

    // Create ClickHouse client
    clickhouseClient = createClickHouseClient();

    // Create retry strategy
    retryStrategy = new RedisRetryStrategy(redis, {
        queueName: 'clickhouse:dead-letter',
        maxRetries: 3,
        retryDelay: 1000,
        logger: logger.child({ component: 'RetryStrategy' })
    });

    // Create ClickHouse repository
    clickhouseRepository = new ClickHouseRepository(clickhouseClient, {
        tableName: clickhouseTable || 'logs',
        logger: logger.child({ component: 'ClickHouseRepository' })
    });

    // Create Redis Stream Queue
    streamQueue = new RedisStreamQueue(redis, {
        streamKey,
        groupName,
        consumerName,
        batchSize,
        claimMinIdleMs,
        logger: logger.child({ component: 'RedisStreamQueue' })
    });

    await streamQueue.initialize();

    // Create BatchBuffer with ACK callback
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
    const idsToAck = flushedLogs
        .map(log => log._redisId)
        .filter(id => id != null);

    if (idsToAck.length === 0) return;

    try {
        await streamQueue.ack(idsToAck);
        logger.debug('Acknowledged messages', { count: idsToAck.length });
    } catch (error) {
        logger.error('Failed to ACK messages', { error: error.message });
    }
}

/**
 * Process pending messages from previous runs
 */
async function processPending() {
    logger.info('Checking for pending messages...');

    // 1. Process own PEL
    let startId = '0-0';
    let pending = await streamQueue.readPending(batchSize, startId);
    while (pending && pending.length > 0) {
        logger.info('Processing own pending messages', { count: pending.length, startId });
        await processMessages(pending);

        // Update startId to the last message ID to get next page
        const lastMsg = pending[pending.length - 1];
        if (lastMsg && lastMsg.id) {
            startId = lastMsg.id;
        }

        pending = await streamQueue.readPending(batchSize, startId);
    }

    // 2. Claim stale messages from dead workers
    let claimed = await streamQueue.recoverPendingMessages();
    while (claimed && claimed.length > 0) {
        logger.info('Processing claimed stale messages', { count: claimed.length });
        await processMessages(claimed);
        claimed = await streamQueue.recoverPendingMessages();
    }
}

/**
 * Process a batch of messages
 */
async function processMessages(messages) {
    if (!messages || messages.length === 0) return;

    const logEntries = messages.map(msg => {
        try {
            const entry = msg.data;

            // Normalize to expected format (camelCase) for Repository
            const normalized = {
                appId: entry.app_id,
                message: entry.message,
                source: entry.source || 'unknown',
                level: entry.level || 'INFO',
                environment: entry.environment || 'development',
                timestamp: entry.timestamp,
                // Ensure metadata is a string if Repository expects metadataString 
                // OR handle it if Repository expects object. 
                // Looking at ClickHouseRepository.save: metadata: log.metadataString
                metadataString: typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata || {}),
                traceId: entry.trace_id,
                userId: entry.user_id,
                // Internal tracking
                _redisId: msg.id
            };

            return normalized;
        } catch (error) {
            logger.error('Failed to parse log entry', { error: error.message });
            streamQueue.ack([msg.id]).catch(() => { });
            return null;
        }
    }).filter(entry => entry !== null);

    if (logEntries.length > 0) {
        await batchBuffer.add(logEntries);
        logger.debug('Buffered messages', { count: logEntries.length });
    }
}

/**
 * Main processing loop
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

        // Read from Redis Stream
        const messages = await streamQueue.read(batchSize);

        if (!messages || messages.length === 0) {
            // Try to claim stale messages when idle
            const claimed = await streamQueue.recoverPendingMessages();
            if (claimed && claimed.length > 0) {
                logger.info('Idle worker claimed stale messages', { count: claimed.length });
                await processMessages(claimed);
            }
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

    // Flush remaining logs
    if (batchBuffer) {
        await batchBuffer.shutdown();
    }

    // Close stream queue
    if (streamQueue) {
        await streamQueue.shutdown();
    }

    // Close Redis
    if (redis) {
        await redis.quit();
    }

    // Close ClickHouse
    if (clickhouseClient) {
        await clickhouseClient.close();
    }

    logger.info('Worker thread shutdown complete');
}

/**
 * Get health status
 */
function getHealth() {
    return {
        isRunning,
        isProcessing,
        consumerName,
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
        parentPort.postMessage({ type: 'ready', consumerName });

        // Process pending then start loop
        await processPending();
        await processLoop();
    } catch (error) {
        logger.error('Worker thread fatal error', { error: error.message });
        parentPort.postMessage({ type: 'error', error: error.message });
        process.exit(1);
    }
})();
