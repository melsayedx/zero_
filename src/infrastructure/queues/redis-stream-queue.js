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
        this.streamKey = options.streamKey;
        this.groupName = options.groupName;
        this.consumerName = options.consumerName;
        this.batchSize = options.batchSize;
        this.blockMs = options.blockMs;  // Short block for responsive event loop
        this.claimMinIdleMs = options.claimMinIdleMs;

        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Create consumer group
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
        const messageBatches = [];
        let cursor = '0-0';
        let totalCount = 0;

        try {
            do {
                const result = await this.redis.xautoclaim(
                    this.streamKey,
                    this.groupName,
                    this.consumerName,
                    this.claimMinIdleMs,
                    cursor,
                    'COUNT', this.batchSize
                );

                if (!result) break;

                // XAUTOCLAIM returns: [nextId, [[id, fields], ...], deletedIds]
                const [nextId, claimedMessages,] = result;
                cursor = nextId;

                if (claimedMessages && claimedMessages.length > 0) {
                    const batch = new Array(claimedMessages.length);
                    let validCount = 0;

                    for (let i = 0; i < claimedMessages.length; i++) {
                        const [id, fields] = claimedMessages[i];
                        const message = this._parseMessage(id, fields);
                        if (message) {
                            batch[validCount++] = message;
                        }
                    }

                    // Trim if we had invalid messages
                    if (validCount < batch.length) {
                        batch.length = validCount;
                    }

                    if (validCount > 0) {
                        messageBatches.push(batch);
                        totalCount += validCount;
                    }
                }
            } while (cursor !== '0-0');

            this.logger.info('Recovered pending messages', { count: totalCount });
        } catch (error) {
            this.logger.error('Error recovering pending messages', { error: error.message });
        }

        return messageBatches.flat();
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
            const result = await this.redis.xreadgroup(
                'GROUP', this.groupName, this.consumerName,
                'COUNT', count,
                'BLOCK', this.blockMs,
                'STREAMS', this.streamKey,
                '>'
            );

            if (!result || result.length === 0) {
                return [];
            }

            // Result format: [[streamKey, [[id, fields], [id, fields], ...]]]
            const [, messages] = result[0];

            const parsedMessages = new Array(messages.length);
            for (let i = 0; i < messages.length; i++) {
                const [id, fields] = messages[i];
                const message = this._parseMessage(id, fields);
                if (message) {
                    parsedMessages[i] = message;
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

        const messageBatches = [];
        let currentId = startId;
        let totalCount = 0;

        try {
            this.logger.info('Reading pending messages', {
                groupName: this.groupName,
                consumerName: this.consumerName,
                count,
                startId,
                streamKey: this.streamKey,
            });

            let lastBatchSize = 0;

            do {
                // XREADGROUP ... STREAMS key startId
                // If startId is '0-0', it gets all pending messages > 0-0
                // If startId is last message ID, it gets next page of pending messages
                const result = await this.redis.xreadgroup(
                    'GROUP', this.groupName, this.consumerName,
                    'COUNT', count,
                    'STREAMS', this.streamKey,
                    currentId
                );

                if (!result || result.length === 0 || result[0][1].length === 0) {
                    lastBatchSize = 0;
                    continue;
                }

                const [, messages] = result[0];
                lastBatchSize = messages.length;

                const batch = new Array(messages.length);
                let validCount = 0;

                for (let i = 0; i < messages.length; i++) {
                    const [id, fields] = messages[i];
                    const message = this._parseMessage(id, fields);
                    if (message) {
                        batch[validCount++] = message;
                    }
                }

                // Trim if we had invalid messages
                if (validCount < batch.length) {
                    batch.length = validCount;
                }

                if (validCount > 0) {
                    messageBatches.push(batch);
                    totalCount += validCount;
                }

                // Always advance to the last seen message ID to get the next page
                currentId = messages[messages.length - 1][0];
            } while (lastBatchSize > 0);

            this.logger.info('Pending messages parsed', { count: totalCount });
            return messageBatches.flat();
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

            this.logger.debug('Acknowledged messages', { count: acknowledged });

            return acknowledged;
        } catch (error) {
            this.logger.error('Error acknowledging messages', { error: error.message });
            throw error;
        }
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
            return { pendingCount: 0, firstId: null, lastId: null, consumers: [] };
        }
    }

    _parseMessage(id, fields) {
        try {
            // fields = [id, data]
            return { id, data: JSON.parse(fields[1]) };
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
