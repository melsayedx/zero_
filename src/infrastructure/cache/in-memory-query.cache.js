const QueryCacheContract = require('../../domain/contracts/query-cache.contract');

/**
 * LRU in-memory query cache for single-instance deployments.
 * @implements {QueryCacheContract}
 */
class InMemoryQueryCache extends QueryCacheContract {
    /**
     * @param {Object} [options] - Config options.
     * @param {number} [options.maxSize=50] - Max cached entries.
     */
    constructor(options = {}) {
        super();

        this.cache = new Map();
        this.maxSize = options.maxSize || 50;
    }

    /**
     * Get a cached value by key.
     * @param {string} key - Cache key
     * @returns {Promise<*>} Cached value or null
     */
    async get(key) {
        return this.cache.get(key) || null;
    }

    /**
     * Set a cached value with LRU eviction.
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @returns {Promise<void>}
     */
    async set(key, value) {
        if (this.cache.size >= this.maxSize) {
            // LRU eviction - remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    /**
     * Clear all cached entries.
     * @returns {Promise<void>}
     */
    async clear() {
        this.cache.clear();
    }

    /**
     * Get current cache statistics.
     * @returns {Object} Cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            type: 'in-memory'
        };
    }
}

module.exports = InMemoryQueryCache;
