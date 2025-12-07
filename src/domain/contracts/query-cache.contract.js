/**
 * Query Cache Contract - Interface for cache implementations.
 *
 * Defines the contract that all cache implementations must follow.
 * Implementations can be in-memory, Redis, Memcached, or any other caching solution.
 *
 * @interface
 */
class QueryCacheContract {
    /**
     * Retrieve a cached value by key.
     * @param {string} key - Cache key
     * @returns {Promise<*>} Cached value or null if not found
     */
    async get(key) {
        throw new Error('QueryCacheContract.get() must be implemented');
    }

    /**
     * Store a value in the cache.
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @returns {Promise<void>}
     */
    async set(key, value) {
        throw new Error('QueryCacheContract.set() must be implemented');
    }

    /**
     * Clear all cached values.
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error('QueryCacheContract.clear() must be implemented');
    }
}

module.exports = QueryCacheContract;
