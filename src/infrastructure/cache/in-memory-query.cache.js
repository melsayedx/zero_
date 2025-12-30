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
        this.maxSize = options.maxSize;
    }

    async get(key) {
        return this.cache.get(key) || null;
    }

    async set(key, value) {
        if (this.cache.size >= this.maxSize) {
            // LRU eviction - remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    async clear() {
        this.cache.clear();
    }

    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            type: 'in-memory'
        };
    }
}

module.exports = InMemoryQueryCache;

