/**
 * Redis Cache Service
 * High-level caching service with query result caching
 */

const { cache } = require('../../config/redis.config');
const logger = require('../../utils/logger');

class RedisCacheService {
  constructor() {
    this.defaultTTL = parseInt(process.env.QUERY_CACHE_TTL) || 300;
    this.keyPrefix = 'cache:';
  }

  /**
   * Generate cache key from query parameters
   * @param {string} prefix - Key prefix
   * @param {Object} params - Query parameters
   * @returns {string} Cache key
   */
  generateKey(prefix, params) {
    const sortedParams = JSON.stringify(params, Object.keys(params).sort());
    return `${this.keyPrefix}${prefix}:${Buffer.from(sortedParams).toString('base64')}`;
  }

  /**
   * Get cached query result
   * @param {string} queryKey - Query identifier
   * @param {Object} params - Query parameters
   * @returns {Promise<any|null>} Cached result or null
   */
  async getQueryResult(queryKey, params) {
    try {
      const key = this.generateKey(queryKey, params);
      const result = await cache.get(key);
      
      if (result) {
        logger.debug('Cache hit', { queryKey, key });
      } else {
        logger.debug('Cache miss', { queryKey, key });
      }
      
      return result;
    } catch (error) {
      logger.error('Cache get error', { queryKey, error: error.message });
      return null;
    }
  }

  /**
   * Cache query result
   * @param {string} queryKey - Query identifier
   * @param {Object} params - Query parameters
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async setQueryResult(queryKey, params, data, ttl = this.defaultTTL) {
    try {
      const key = this.generateKey(queryKey, params);
      await cache.set(key, data, ttl);
      logger.debug('Cache set', { queryKey, key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error', { queryKey, error: error.message });
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   * @param {string} pattern - Pattern to match
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidatePattern(pattern) {
    try {
      const fullPattern = `${this.keyPrefix}${pattern}*`;
      const count = await cache.clearPattern(fullPattern);
      logger.info('Cache invalidated', { pattern, count });
      return count;
    } catch (error) {
      logger.error('Cache invalidation error', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Invalidate specific query cache
   * @param {string} queryKey - Query identifier
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateQuery(queryKey) {
    return this.invalidatePattern(queryKey);
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    try {
      const client = require('../../config/redis.config').getRedisClient();
      const info = await client.info('stats');
      
      // Parse info string
      const stats = {};
      info.split('\r\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });
      
      return {
        hits: parseInt(stats.keyspace_hits) || 0,
        misses: parseInt(stats.keyspace_misses) || 0,
        hitRate: stats.keyspace_hits && stats.keyspace_misses
          ? ((parseInt(stats.keyspace_hits) / 
             (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))) * 100).toFixed(2)
          : 0
      };
    } catch (error) {
      logger.error('Cache stats error', { error: error.message });
      return { hits: 0, misses: 0, hitRate: 0 };
    }
  }

  /**
   * Warm up cache with predefined queries
   * @param {Array} queries - Array of {key, params, fetcher} objects
   * @returns {Promise<number>} Number of queries cached
   */
  async warmUp(queries) {
    let count = 0;
    
    for (const query of queries) {
      try {
        const data = await query.fetcher(query.params);
        await this.setQueryResult(query.key, query.params, data, query.ttl);
        count++;
      } catch (error) {
        logger.error('Cache warm-up error', { 
          query: query.key, 
          error: error.message 
        });
      }
    }
    
    logger.info('Cache warm-up completed', { count });
    return count;
  }
}

module.exports = new RedisCacheService();

