const Redis = require('ioredis');
const { LoggerFactory } = require('../logging');

// Module-level logger for Redis operations
const logger = LoggerFactory.named('Redis');

/**
 * Redis Configuration and Client Initialization
 * 
 * This module handles the connection to Redis, which is used as
 * a high-throughput buffer for log ingestion.
 */

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),

  // Retry strategy
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Reconnect on error
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error indicates waiting for the cluster to stabilize
      return true;
    }
  }
};

let redisClient = null;

/**
 * Get or create the shared Redis client instance (for ingestion)
 * @returns {Redis} Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    logger.info('Connecting to Redis', { host: redisConfig.host, port: redisConfig.port });
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err });
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });
  }

  return redisClient;
}

/**
 * Create a new dedicated Redis client for workers.
 * Workers use blocking operations (XREADGROUP BLOCK) which would
 * starve the shared client if used on the same connection.
 * 
 * @param {string} [name='worker'] - Name for logging purposes
 * @returns {Redis} New Redis client instance
 */
function createWorkerRedisClient(name = 'worker') {
  const client = new Redis(redisConfig);

  client.on('error', (err) => {
    logger.error('Worker Redis connection error', { name, error: err.message });
  });

  return client;
}

/**
 * Close the shared Redis connection
 */
async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

module.exports = {
  redisConfig,
  getRedisClient,
  createWorkerRedisClient,
  closeRedisConnection
};

