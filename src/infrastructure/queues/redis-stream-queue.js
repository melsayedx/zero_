/**
 * Durable message queue using Redis Streams with consumer groups.
 */
class RedisStreamQueue {
    /**
     * @param {Redis} redisClient - Ioredis client.
     * @param {Object} [options] - Config options.
     * @param {string} [options.groupName='log-processors'] - Consumer group.
     */
    constructor(redisClient, options = {}) {
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
                this.logger.error('Failed to create consumer group', { error: error.message, stack: error.stack });
                throw error;
            }

            this.logger.debug('Consumer group already exists (BUSYGROUP)', { groupName: this.groupName });
        }

        // Verify group exists
        try {
            const groups = await this.redis.xinfo('GROUPS', this.streamKey);
            const groupExists = groups.some(g => {
                // ioredis returns array of arrays or objects depending on version/config
                // Usually objects for xinfo in recent versions, but let's check carefully
                const name = g.name || (Array.isArray(g) ? g[1] : null);
                return name === this.groupName;
            });

            if (!groupExists) {
                this.logger.error('CRITICAL: Consumer group does not exist after creation!', {
                    groupName: this.groupName,
                    groups: JSON.stringify(groups)
                });
            } else {
                this.logger.info('Verified consumer group exists', { groupName: this.groupName });
            }
        } catch (err) {
            // XINFO might fail if key doesn't exist (but creation should have made it)
            this.logger.warn('Failed to verify consumer group', { error: err.message });
        }

        // Recovery is now handled explicitly by the worker
        // await this.recoverPendingMessages();

        this.isInitialized = true;

        this.logger.info('RedisStreamQueue initialized', {
            streamKey: this.streamKey,
            groupName: this.groupName,
            consumerName: this.consumerName,
            batchSize: this.batchSize
        });
    }

    /**
     * Claims stale pending messages from crashed consumers.
     * @returns {Promise<Array>} Recovered messages.
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
     * Reads new messages via consumer group.
     * @param {number} [count] - Max messages to read.
     * @returns {Promise<Array>} Messages { id, data }.
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
            for (let i = 0; i < messages.length; i++) {
                const [id, fields] = messages[i];
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
     * Reads pending messages (delivered but not ACKed).
     * @param {number} [count] - Max messages.
     * @param {string} [startId='0-0'] - Start ID for pagination.
     * @returns {Promise<Array>} Pending messages.
     */
    async readPending(count = this.batchSize, startId = '0-0') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            this.logger.info('Reading pending messages', {
                groupName: this.groupName,
                consumerName: this.consumerName,
                count,
                startId,
                streamKey: this.streamKey,
            });
            // XREADGROUP ... STREAMS key startId
            // If startId is '0-0', it gets all pending messages > 0-0
            // If startId is last message ID, it gets next page of pending messages
            const result = await this.redis.xreadgroup(
                'GROUP', this.groupName, this.consumerName,
                'COUNT', count,
                'STREAMS', this.streamKey,
                startId
            );

            if (!result || result.length === 0) {
                return [];
            }

            const [, messages] = result[0];
            const parsedMessages = [];
            for (let i = 0; i < messages.length; i++) {
                const [id, fields] = messages[i];
                const message = this._parseMessage(id, fields);
                if (message) {
                    parsedMessages.push(message);
                }
            }
            this.logger.info('Pending messages parsed', { count: parsedMessages.length });
            return parsedMessages;
        } catch (error) {
            this.logger.error('Error reading pending messages', { error: error.message });
            return [];
        }
    }

    /**
     * Acknowledges messages (removes from pending).
     * @param {Array<string>} messageIds - IDs to ACK.
     * @returns {Promise<number>} Count of ACKed messages.
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
     * Adds messages to the stream.
     * @param {Array<Object>} messages - Messages to add.
     * @returns {Promise<Array<string>>} Assigned IDs.
     */
    async add(messages) {
        if (!messages || messages.length === 0) {
            return [];
        }

        const ids = [];
        const pipeline = this.redis.pipeline();

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            // XADD streamKey MAXLEN ~ 100000 * field value
            // '~' means approximate trimming (much faster than exact)
            // 100000 is the limit - older messages are removed from history
            pipeline.xadd(this.streamKey, 'MAXLEN', '~', 100000, '*', 'data', JSON.stringify(msg));
        }

        const results = await pipeline.exec();

        for (let i = 0; i < results.length; i++) {
            const [err, id] = results[i];
            if (err) {
                this.logger.error('Error adding message', { error: err.message });
            } else {
                ids.push(id);
            }
        }

        return ids;
    }

    /**
     * Gets pending message stats.
     * @returns {Promise<Object>} { pendingCount, firstId, lastId, consumers }.
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
     * Parses raw stream message.
     * @private
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

    async shutdown() {
        const pending = await this.getPendingInfo();
        this.logger.info('Shutting down', { pendingCount: pending.pendingCount });
        this.isInitialized = false;
    }
}

module.exports = RedisStreamQueue;
