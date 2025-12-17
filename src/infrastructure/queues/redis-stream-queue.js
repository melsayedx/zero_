/**
 * RedisStreamQueue - Durable message queue using Redis Streams
 *
 * This class provides a crash-proof message queue implementation using Redis Streams
 * with consumer groups. Messages are only removed from the stream after explicit
 * acknowledgment, ensuring no data loss even if the worker crashes mid-processing.
 *
 * Key features:
 * - Consumer group support for reliable message delivery
 * - Batch reading with configurable size and blocking timeout
 * - Automatic acknowledgment management
 * - Pending message recovery on startup (claims stale messages)
 * - Auto-creates stream and consumer group if they don't exist
 *
 * @example
 * ```javascript
 * const queue = new RedisStreamQueue(redisClient, {
 *   streamKey: 'logs:stream',
 *   groupName: 'log-processors',
 *   consumerName: 'worker-1'
 * });
 *
 * await queue.initialize();
 *
 * // Read messages (moved to pending list)
 * const messages = await queue.read(1000);
 *
 * // Process and acknowledge
 * await queue.ack(messages.map(m => m.id));
 * ```
 */
class RedisStreamQueue {
    /**
     * Create a new RedisStreamQueue instance.
     *
     * @param {Redis} redisClient - Configured Redis client (ioredis)
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.streamKey='logs:stream'] - Redis key for the stream
     * @param {string} [options.groupName='log-processors'] - Consumer group name
     * @param {string} [options.consumerName] - Unique consumer name (defaults to hostname + pid)
     * @param {number} [options.batchSize=2000] - Number of messages to read per batch
     * @param {number} [options.blockMs=5000] - Milliseconds to block waiting for new messages
     * @param {number} [options.claimMinIdleMs=30000] - Min idle time before claiming pending messages
     * @param {boolean} [options.enableLogging=true] - Whether to enable console logging
     */
    constructor(redisClient, options = {}) {
        if (!redisClient) {
            throw new Error('Redis client is required');
        }
        if (!options.logger) {
            throw new Error('Logger is required - must be injected from DI container');
        }

        this.redis = redisClient;
        this.logger = options.logger;
        this.streamKey = options.streamKey || 'logs:stream';
        this.groupName = options.groupName || 'log-processors';
        this.consumerName = options.consumerName || `worker-${process.pid}`;
        this.batchSize = options.batchSize || 2000;
        this.blockMs = options.blockMs || 100;  // Short block for responsive event loop
        this.claimMinIdleMs = options.claimMinIdleMs || 30000;

        this.isInitialized = false;
    }

    /**
     * Initialize the queue by creating stream and consumer group if needed.
     *
     * This method ensures the Redis stream and consumer group exist before
     * processing begins. It also recovers any pending messages from previous
     * crashed workers.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Create consumer group (creates stream automatically if MKSTREAM is used)
            // If group already exists, this will fail silently
            await this.redis.xgroup(
                'CREATE',
                this.streamKey,
                this.groupName,
                '0', // Start from beginning of stream
                'MKSTREAM' // Create stream if it doesn't exist
            );

            this.logger.info('Created consumer group', { groupName: this.groupName, streamKey: this.streamKey });
        } catch (error) {
            // BUSYGROUP means group already exists - that's fine
            if (!error.message.includes('BUSYGROUP')) {
                throw error;
            }

            this.logger.debug('Consumer group already exists', { groupName: this.groupName });
        }

        // Recover pending messages from crashed workers
        await this.recoverPendingMessages();

        this.isInitialized = true;

        this.logger.info('RedisStreamQueue initialized', {
            streamKey: this.streamKey,
            groupName: this.groupName,
            consumerName: this.consumerName,
            batchSize: this.batchSize
        });
    }

    /**
     * Recover pending messages from crashed workers.
     *
     * Claims messages that have been pending for longer than `claimMinIdleMs`
     * from other consumers. This ensures messages aren't lost if a worker
     * crashes without acknowledging them.
     *
     * @returns {Promise<Array>} Array of recovered messages
     */
    async recoverPendingMessages() {
        const recoveredMessages = [];

        try {
            // Use XAUTOCLAIM to claim stale pending messages
            // This atomically claims messages that have been idle for too long
            const result = await this.redis.xautoclaim(
                this.streamKey,
                this.groupName,
                this.consumerName,
                this.claimMinIdleMs,
                '0-0', // Start from beginning of pending list
                'COUNT', this.batchSize
            );

            // XAUTOCLAIM returns: [nextId, [[id, fields], ...], deletedIds]
            if (result && result[1] && result[1].length > 0) {
                const claimedMessages = result[1];

                for (const [id, fields] of claimedMessages) {
                    const message = this._parseMessage(id, fields);
                    if (message) {
                        recoveredMessages.push(message);
                    }
                }

                this.logger.info('Recovered pending messages', { count: recoveredMessages.length });
            }
        } catch (error) {
            // XAUTOCLAIM might not be available in older Redis versions
            if (error.message.includes('unknown command')) {
                this.logger.warn('XAUTOCLAIM not available, skipping pending recovery');
            } else {
                this.logger.error('Error recovering pending messages', { error: error.message });
            }
        }

        return recoveredMessages;
    }

    /**
     * Read a batch of messages from the stream.
     *
     * Uses XREADGROUP to read new messages. Messages are automatically added
     * to the pending list and must be acknowledged with `ack()` after successful
     * processing.
     *
     * @param {number} [count] - Number of messages to read (defaults to batchSize)
     * @returns {Promise<Array>} Array of messages with { id, data } structure
     *
     * @example
     * ```javascript
     * const messages = await queue.read(1000);
     * // messages = [{ id: '1701234567890-0', data: { ... } }, ...]
     * ```
     */
    async read(count = this.batchSize) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // XREADGROUP GROUP groupName consumerName [COUNT count] [BLOCK ms] STREAMS key >
            // The '>' ID means: only new messages that were never delivered to any consumer
            const result = await this.redis.xreadgroup(
                'GROUP', this.groupName, this.consumerName,
                'COUNT', count,
                'BLOCK', this.blockMs,
                'STREAMS', this.streamKey,
                '>' // Only new messages
            );

            if (!result || result.length === 0) {
                return [];
            }

            // Result format: [[streamKey, [[id, fields], [id, fields], ...]]]
            const [, messages] = result[0];

            const parsedMessages = [];
            for (const [id, fields] of messages) {
                const message = this._parseMessage(id, fields);
                if (message) {
                    parsedMessages.push(message);
                }
            }

            return parsedMessages;
        } catch (error) {
            this.logger.error('Error reading from stream', { error: error.message });
            throw error;
        }
    }

    /**
     * Acknowledge messages as successfully processed.
     *
     * Removes messages from the pending list. Only call this after the messages
     * have been successfully persisted to the database.
     *
     * @param {Array<string>} messageIds - Array of message IDs to acknowledge
     * @returns {Promise<number>} Number of messages acknowledged
     *
     * @example
     * ```javascript
     * const messages = await queue.read();
     * await saveToDB(messages);
     * await queue.ack(messages.map(m => m.id));
     * ```
     */
    async ack(messageIds) {
        if (!messageIds || messageIds.length === 0) {
            return 0;
        }

        try {
            // XACK streamKey groupName id [id ...]
            const acknowledged = await this.redis.xack(
                this.streamKey,
                this.groupName,
                ...messageIds
            );

            if (acknowledged > 0) {
                this.logger.debug('Acknowledged messages', { count: acknowledged });
            }

            return acknowledged;
        } catch (error) {
            this.logger.error('Error acknowledging messages', { error: error.message });
            throw error;
        }
    }

    /**
     * Add messages to the stream (for producers).
     *
     * @param {Array<Object>} messages - Array of message objects to add
     * @returns {Promise<Array<string>>} Array of assigned message IDs
     *
     * @example
     * ```javascript
     * const ids = await queue.add([{ level: 'INFO', message: 'Test' }]);
     * ```
     */
    async add(messages) {
        if (!messages || messages.length === 0) {
            return [];
        }

        const ids = [];
        const pipeline = this.redis.pipeline();

        for (const msg of messages) {
            // XADD streamKey * field value [field value ...]
            // We serialize the entire message as JSON in a 'data' field
            pipeline.xadd(this.streamKey, '*', 'data', JSON.stringify(msg));
        }

        const results = await pipeline.exec();

        for (const [err, id] of results) {
            if (err) {
                this.logger.error('Error adding message', { error: err.message });
            } else {
                ids.push(id);
            }
        }

        return ids;
    }

    /**
     * Get information about pending messages.
     *
     * @returns {Promise<Object>} Pending info including count and consumers
     */
    async getPendingInfo() {
        try {
            const info = await this.redis.xpending(this.streamKey, this.groupName);
            // Returns: [pendingCount, firstId, lastId, [[consumer, count], ...]]
            return {
                pendingCount: info[0] || 0,
                firstId: info[1],
                lastId: info[2],
                consumers: info[3] || []
            };
        } catch (error) {
            this.logger.error('Error getting pending info', { error: error.message });
            return { pendingCount: 0, consumers: [] };
        }
    }

    /**
     * Get stream length (total messages including acknowledged).
     *
     * @returns {Promise<number>} Stream length
     */
    async getStreamLength() {
        try {
            return await this.redis.xlen(this.streamKey);
        } catch (error) {
            return 0;
        }
    }

    /**
     * Parse raw Redis stream message into structured format.
     *
     * @private
     * @param {string} id - Message ID
     * @param {Array} fields - Array of field-value pairs
     * @returns {Object|null} Parsed message or null if invalid
     */
    _parseMessage(id, fields) {
        try {
            // Fields is a flat array: ['field1', 'value1', 'field2', 'value2', ...]
            const fieldMap = {};
            for (let i = 0; i < fields.length; i += 2) {
                fieldMap[fields[i]] = fields[i + 1];
            }

            // We expect a 'data' field with JSON content
            if (fieldMap.data) {
                return {
                    id,
                    data: JSON.parse(fieldMap.data)
                };
            }

            // Fallback: return all fields as data
            return { id, data: fieldMap };
        } catch (error) {
            this.logger.error('Error parsing message', { id, error: error.message });
            return null;
        }
    }

    /**
     * Trim the stream to keep only recent messages.
     *
     * @param {number} maxLen - Maximum stream length to keep
     * @returns {Promise<number>} Number of messages trimmed
     */
    async trim(maxLen = 100000) {
        try {
            return await this.redis.xtrim(this.streamKey, 'MAXLEN', '~', maxLen);
        } catch (error) {
            this.logger.error('Error trimming stream', { error: error.message });
            return 0;
        }
    }

    /**
     * Graceful shutdown - no cleanup needed for Redis streams.
     *
     * @returns {Promise<void>}
     */
    async shutdown() {
        const pending = await this.getPendingInfo();
        this.logger.info('Shutting down', { pendingCount: pending.pendingCount });
        this.isInitialized = false;
    }
}

module.exports = RedisStreamQueue;
