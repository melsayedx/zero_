/** Interface for cache implementations. */
class QueryCacheContract {
    /**
     * Retrieves cached value.
     * @param {string} key - Cache key.
     * @returns {Promise<*>} Value or null.
     */
    async get(key) {
        throw new Error('QueryCacheContract.get() must be implemented');
    }

    /**
     * Stores value in cache.
     * @param {string} key - Cache key.
     * @param {*} value - Value.
     * @returns {Promise<void>}
     */
    async set(key, value) {
        throw new Error('QueryCacheContract.set() must be implemented');
    }

    /**
     * Clears all values.
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error('QueryCacheContract.clear() must be implemented');
    }
}

module.exports = QueryCacheContract;
