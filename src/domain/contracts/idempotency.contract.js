/**
 * IdempotencyContract - Abstract contract for idempotency store implementations.
 *
 * This contract defines the interface for storing and retrieving idempotency keys
 * to prevent duplicate request processing. Implementations can use Redis, in-memory,
 * or any other storage backend.
 *
 * @example
 * ```javascript
 * class RedisIdempotencyStore extends IdempotencyContract {
 *   async get(key) {
 *     const cached = await this.redis.get(`idempotency:${key}`);
 *     return cached ? JSON.parse(cached) : null;
 *   }
 *
 *   async set(key, response, ttlSeconds) {
 *     return await this.redis.set(key, JSON.stringify(response), 'EX', ttlSeconds, 'NX') === 'OK';
 *   }
 * }
 * ```
 *
 * @interface
 */
class IdempotencyContract {
    /**
     * Retrieve a cached response by idempotency key.
     *
     * @param {string} key - The idempotency key from the request header/metadata
     * @returns {Promise<Object|null>} The cached response object, or null if not found
     */
    async get(key) {
        throw new Error('IdempotencyContract.get() must be implemented');
    }

    /**
     * Store a response for the given idempotency key.
     *
     * This operation should be atomic - if the key already exists, it should NOT
     * overwrite the existing value (SET NX semantics).
     *
     * @param {string} key - The idempotency key from the request header/metadata
     * @param {Object} response - The response object to cache
     * @param {number} [ttlSeconds=86400] - Time-to-live in seconds (default 24 hours)
     * @returns {Promise<boolean>} True if the key was set (new), false if it already existed
     */
    async set(key, response, ttlSeconds = 86400) {
        throw new Error('IdempotencyContract.set() must be implemented');
    }

    /**
     * Delete an idempotency key (for testing/administrative purposes).
     *
     * @param {string} key - The idempotency key to delete
     * @returns {Promise<boolean>} True if the key was deleted, false if it didn't exist
     */
    async delete(key) {
        throw new Error('IdempotencyContract.delete() must be implemented');
    }
}

module.exports = IdempotencyContract;
