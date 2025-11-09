/**
 * Cache Port (Interface)
 * Defines contract for caching implementations
 * Currently unused - prepared for future
 */

class CachePort {
  /**
   * Get value from cache
   * @param {string} key 
   * @returns {Promise<any>}
   */
  async get(key) {
    throw new Error('Method not implemented');
  }

  /**
   * Set value in cache
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    throw new Error('Method not implemented');
  }
}

module.exports = CachePort;

