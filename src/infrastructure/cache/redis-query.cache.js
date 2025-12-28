const QueryCacheContract = require('../../domain/contracts/query-cache.contract');

/**
 * Distributed query cache using Redis with TTL-based expiration.
 * @implements {QueryCacheContract}
 */
class RedisQueryCache extends QueryCacheContract {
    /**
     * @param {Object} redisClient - Redis client instance.
     * @param {Object} [options] - Config options.
     * @param {string} [options.prefix='query:cache'] - Key prefix.
     * @param {number} [options.ttl=3600] - TTL in seconds.
     */
    constructor(redisClient, options = {}) {
        super();

        this.redis = redisClient;
        this.prefix = options.prefix;
        this.ttl = options.ttl;
    }


    _buildKey(key) {
        return `${this.prefix}:${key}`;
    }

    async get(key) {
        try {
            const data = await this.redis.get(this._buildKey(key));
            return data ? JSON.parse(data) : null;
        } catch (error) {
            // Fallback to no cache on error
            return null;
        }
    }

    async set(key, value) {
        try {
            await this.redis.setex(this._buildKey(key), this.ttl, JSON.stringify(value));
        } catch (error) {
            // Silently fail - caching is not critical
        }
    }

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

