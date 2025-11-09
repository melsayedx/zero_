/**
 * Redis Configuration
 * Handles Redis connection and client management for caching and session storage
 */

const Redis = require('ioredis');
const dbConfig = require('./database.config');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initialize Redis client with connection pooling
 * @returns {Promise<Object>} Redis client instance
 */
const initRedis = async () => {
  if (redisClient) {
    return redisClient;
  }

  try {
    const config = dbConfig.redis;
    
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      retryStrategy: config.retryStrategy,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableReadyCheck: config.enableReadyCheck,
      enableOfflineQueue: config.enableOfflineQueue,
      lazyConnect: config.lazyConnect
    });

    // Connection event handlers
    redisClient.on('connect', () => {
      logger.info('Redis connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis connected successfully', {
        host: config.host,
        port: config.port,
        db: config.db
      });
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', (delay) => {
      logger.info('Redis reconnecting', { delay });
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await closeRedis();
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis', { error: error.message });
    throw error;
  }
};

/**
 * Get existing Redis client instance
 * @returns {Object} Redis client
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
};

/**
 * Close Redis connection
 * @returns {Promise<void>}
 */
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Health check for Redis
 * @returns {Promise<boolean>} Connection status
 */
const healthCheck = async () => {
  try {
    if (!redisClient) {
      return false;
    }
    
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', { error: error.message });
    return false;
  }
};

/**
 * Cache helper functions
 */
const cache = {
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  },

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = 300) {
    try {
      const client = getRedisClient();
      await client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async del(key) {
    try {
      const client = getRedisClient();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Clear cache by pattern
   * @param {string} pattern - Key pattern to match
   * @returns {Promise<number>} Number of keys deleted
   */
  async clearPattern(pattern) {
    try {
      const client = getRedisClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        return await client.del(...keys);
      }
      return 0;
    } catch (error) {
      logger.error('Cache clear pattern error', { pattern, error: error.message });
      return 0;
    }
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  closeRedis,
  healthCheck,
  cache
};

