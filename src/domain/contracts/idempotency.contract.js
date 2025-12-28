class IdempotencyContract {
    /**
     * Retrieves cached response.
     * @param {string} key - Idempotency key.
     * @returns {Promise<Object|null>} Cached response or null.
     */
    async get(key) {
        throw new Error('IdempotencyContract.get() must be implemented');
    }

    /**
     * Stores response atomically (NX).
     * @param {string} key - Idempotency key.
     * @param {Object} response - Response to cache.
     * @param {number} [ttlSeconds=86400] - TTL in seconds.
     * @returns {Promise<boolean>} True if set (new), false if exists.
     */
    async set(key, response, ttlSeconds = 86400) {
        throw new Error('IdempotencyContract.set() must be implemented');
    }

    /**
     * Deletes a key.
     * @param {string} key - Key to delete.
     * @returns {Promise<boolean>} True if deleted.
     */
    async delete(key) {
        throw new Error('IdempotencyContract.delete() must be implemented');
    }
}

module.exports = IdempotencyContract;
