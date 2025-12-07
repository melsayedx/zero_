const QueryCacheContract = require('../../domain/contracts/query-cache.contract');

/**
 * Redis Query Cache - Distributed caching for multi-instance deployments.
 *
 * Uses Redis as a distributed cache backend for query results.
 * Supports TTL-based expiration and automatic key prefixing.
 *
 * Best for:
 * - Multi-instance deployments
 * - Production environments
 * - Shared cache across services
 *
 * @implements {QueryCacheContract}
 *
 * @example
 * ```javascript
 * const cache = new RedisQueryCache(redisClient, {
 *   prefix: 'app:cache',
 *   ttl: 3600
 * });
 * await cache.set('query:1', { data: 'results' });
 * const result = await cache.get('query:1');
 * ```
 */
class RedisQueryCache extends QueryCacheContract {
    /**
     * Create a new RedisQueryCache instance.
     *
     * @param {Object} redisClient - Redis client instance (ioredis or compatible)
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.prefix='query:cache'] - Key prefix for all cache entries
     * @param {number} [options.ttl=3600] - Time-to-live in seconds (default: 1 hour)
     */
    constructor(redisClient, options = {}) {
        super();
        if (!redisClient) {
            throw new Error('Redis client is required for RedisQueryCache');
        }
        this.redis = redisClient;
        this.prefix = options.prefix || 'query:cache';
        this.ttl = options.ttl || 3600;
    }

    /**
     * Build the full Redis key with prefix.
     * @private
     * @param {string} key - Raw cache key
     * @returns {string} Prefixed Redis key
     */
    _getKey(key) {
        return `${this.prefix}:${key}`;
    }

    /**
     * Get a cached value by key.
     * @param {string} key - Cache key
     * @returns {Promise<*>} Cached value or null
     */
    async get(key) {
        try {
            const data = await this.redis.get(this._getKey(key));
            return data ? JSON.parse(data) : null;
        } catch (error) {
            // Fallback to no cache on error
            return null;
        }
    }

    /**
     * Set a cached value with TTL.
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @returns {Promise<void>}
     */
    async set(key, value) {
        try {
            await this.redis.setex(this._getKey(key), this.ttl, JSON.stringify(value));
        } catch (error) {
            // Silently fail - caching is not critical
        }
    }

    /**
     * Clear all cached entries with this prefix.
     * @returns {Promise<void>}
     */
    async clear() {
        try {
            const keys = await this.redis.keys(`${this.prefix}:*`);
            if (keys.length > 0) {
                await this.redis.del(keys);
            }
        } catch (error) {
            // Silently fail
        }
    }

    /**
     * Get current cache statistics.
     * @returns {Promise<Object>} Cache statistics
     */
    async getStats() {
        try {
            const keys = await this.redis.keys(`${this.prefix}:*`);
            return {
                size: keys.length,
                prefix: this.prefix,
                ttl: this.ttl,
                type: 'redis'
            };
        } catch (error) {
            return { type: 'redis', error: error.message };
        }
    }
}

module.exports = RedisQueryCache;
