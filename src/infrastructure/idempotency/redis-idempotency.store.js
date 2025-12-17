const IdempotencyContract = require('../../domain/contracts/idempotency.contract');

/**
 * RedisIdempotencyStore - Redis implementation for idempotency key storage.
 *
 * Uses Redis SET with NX (not exists) and EX (expiration) flags for atomic
 * check-and-set operations. This ensures that only the first request with a
 * given idempotency key is processed, and subsequent requests receive the
 * cached response.
 *
 * @example
 * ```javascript
 * const store = new RedisIdempotencyStore(redisClient, { ttl: 86400 });
 *
 * // Check for existing response
 * const cached = await store.get('request-123');
 * if (cached) {
 *   return cached; // Return cached response
 * }
 *
 * // Process request...
 * const response = await processRequest();
 *
 * // Cache response
 * await store.set('request-123', response);
 * return response;
 * ```
 */
class RedisIdempotencyStore extends IdempotencyContract {
    /**
     * Create a new RedisIdempotencyStore instance.
     *
     * @param {Redis} redisClient - Configured ioredis client instance
     * @param {Object} [options={}] - Configuration options
     * @param {number} [options.ttl=86400] - Default TTL in seconds (24 hours)
     * @param {string} [options.prefix='idempotency'] - Redis key prefix
     * @param {Logger} [options.logger] - Logger instance
     */
    constructor(redisClient, options = {}) {
        super();

        if (!redisClient) {
            throw new Error('Redis client is required for RedisIdempotencyStore');
        }

        this.redis = redisClient;
        this.ttl = options.ttl || 86400; // 24 hours default
        this.prefix = options.prefix || 'idempotency';
        this.logger = options.logger;
    }

    /**
     * Build the full Redis key with prefix.
     *
     * @private
     * @param {string} key - The idempotency key
     * @returns {string} Full Redis key
     */
    _buildKey(key) {
        return `${this.prefix}:${key}`;
    }

    /**
     * Retrieve a cached response by idempotency key.
     *
     * @param {string} key - The idempotency key from the request header/metadata
     * @returns {Promise<Object|null>} The cached response object, or null if not found
     */
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

            if (this.logger) {
                this.logger.debug('Cache HIT', { key });
            }

            return response;
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error getting cached response', { error: error.message });
            }
            return null; // Fail open - allow request to proceed
        }
    }

    /**
     * Store a response for the given idempotency key.
     *
     * Uses SET NX EX for atomic check-and-set with expiration.
     * If the key already exists, this operation does nothing (NX semantics).
     *
     * @param {string} key - The idempotency key from the request header/metadata
     * @param {Object} response - The response object to cache
     * @param {number} [ttlSeconds] - Time-to-live in seconds (defaults to instance TTL)
     * @returns {Promise<boolean>} True if the key was set (new), false if it already existed
     */
    async set(key, response, ttlSeconds) {
        if (!key || typeof key !== 'string') {
            return false;
        }

        const effectiveTtl = ttlSeconds || this.ttl;

        try {
            const redisKey = this._buildKey(key);
            const serialized = JSON.stringify(response);

            // SET key value EX ttl NX
            // NX: Only set if key does not exist
            // EX: Set expiration in seconds
            const result = await this.redis.set(redisKey, serialized, 'EX', effectiveTtl, 'NX');

            const wasSet = result === 'OK';

            if (this.logger) {
                this.logger.debug(wasSet ? 'Cache SET' : 'Cache EXISTS', { key });
            }

            return wasSet;
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error setting cached response', { error: error.message });
            }
            return false; // Fail open - don't prevent request processing
        }
    }

    /**
     * Delete an idempotency key (for testing/administrative purposes).
     *
     * @param {string} key - The idempotency key to delete
     * @returns {Promise<boolean>} True if the key was deleted, false if it didn't exist
     */
    async delete(key) {
        if (!key || typeof key !== 'string') {
            return false;
        }

        try {
            const redisKey = this._buildKey(key);
            const deleted = await this.redis.del(redisKey);

            if (this.logger) {
                this.logger.debug('Cache DELETE', { key, removed: deleted });
            }

            return deleted > 0;
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error deleting key', { error: error.message });
            }
            return false;
        }
    }

    /**
     * Get statistics about idempotency key usage.
     *
     * @returns {Promise<Object>} Statistics object
     */
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
