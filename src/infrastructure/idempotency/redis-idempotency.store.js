const IdempotencyContract = require('../../domain/contracts/idempotency.contract');

/**
 * Redis-backed idempotency store using atomic operations.
 * 
 * In set method, if key exists, it will not be overwritten
 * unless force option is set to true. This is to prevent
 * in-flight requests from doing duplicate work.
 *
 * @example
 * const store = new RedisIdempotencyStore(redisClient);
 * const cached = await store.get('key');
 * if (!cached) await store.set('key', response);
 */
class RedisIdempotencyStore extends IdempotencyContract {
    /**
     * Creates a new store instance.
     * @param {Redis} redisClient - Configured ioredis client.
     * @param {Object} [options] - Configuration options.
     * @param {number} [options.ttl=86400] - Default TTL in seconds.
     * @param {string} [options.prefix='idempotency'] - Key prefix.
     * @param {Logger} [options.logger] - Logger instance.
     */
    constructor(redisClient, options = {}) {
        super();

        this.redis = redisClient;
        this.ttl = options.ttl;
        this.prefix = options.prefix;
        this.logger = options.logger;
    }

    _buildKey(key) {
        return `${this.prefix}:${key}`;
    }

    async get(key) {
        if (!key || typeof key !== 'string') {
            return null;
        }

        try {
            const redisKey = this._buildKey(key);
            const cached = await this.redis.get(redisKey);

            if (!cached) {
                return null;
            }

            const response = JSON.parse(cached);
            this.logger.debug('Cache HIT', { key });
            return response;
        } catch (error) {
            this.logger.error('Error getting cached response', { error: error.message });
            return null; // Fail open - allow request to proceed
        }
    }

    /**
     * Atomically stores response if key doesn't exist.
     * @param {string} key - Idempotency key.
     * @param {object} response - Response to cache.
     * @param {number} [ttlSeconds] - Optional Custom TTL.
     * @param {object} [options] - Options.
     * @param {boolean} [options.force=false] - Overwrite existing key.
     * @returns {Promise<boolean>} True if set, false if existed or error.
     */
    async set(key, response, ttlSeconds, options = {}) {
        if (!key || typeof key !== 'string') {
            return false;
        }

        const effectiveTtl = ttlSeconds || this.ttl;
        const force = options.force || false;

        try {
            const redisKey = this._buildKey(key);
            const serialized = JSON.stringify(response);

            let result;
            if (force) {
                await this.redis.set(redisKey, serialized, 'EX', effectiveTtl);
                result = 'OK';
            } else {
                result = await this.redis.set(redisKey, serialized, 'EX', effectiveTtl, 'NX');
            }

            const wasSet = result === 'OK';
            this.logger.debug(wasSet ? (force ? 'Cache FORCE SET' : 'Cache SET') : 'Cache EXISTS', { key });
            return wasSet;
        } catch (error) {
            this.logger.error('Error setting cached response', { error: error.message });
            return false;
        }
    }

    async delete(key) {
        if (!key || typeof key !== 'string') {
            return false;
        }

        try {
            const redisKey = this._buildKey(key);
            const deleted = await this.redis.del(redisKey);
            this.logger.debug('Cache DELETE', { key, removed: deleted });
            return deleted > 0;
        } catch (error) {
            this.logger.error('Error deleting key', { error: error.message });
            return false;
        }
    }

    async getStats() {
        try {
            // Count keys matching the prefix
            const keys = await this.redis.keys(`${this.prefix}:*`);
            return {
                activeKeys: keys.length,
                prefix: this.prefix,
                defaultTtl: this.ttl
            };
        } catch (error) {
            return {
                error: error.message,
                prefix: this.prefix
            };
        }
    }
}

module.exports = RedisIdempotencyStore;
