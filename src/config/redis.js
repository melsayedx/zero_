const Redis = require('ioredis');

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
 * Get or create the Redis client instance
 * @returns {Redis} Redis client instance
 */
function getRedisClient() {
  if (!redisClient) {
    console.log(`[Redis] Connecting to ${redisConfig.host}:${redisConfig.port}...`);
    redisClient = new Redis(redisConfig);
    
    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
    
    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });
    
    redisClient.on('ready', () => {
      console.log('[Redis] Client ready');
    });
  }
  
  return redisClient;
}

/**
 * Close the Redis connection
 */
async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed');
  }
}

module.exports = {
  redisConfig,
  getRedisClient,
  closeRedisConnection
};

