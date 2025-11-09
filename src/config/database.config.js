/**
 * Database Configuration Module
 * Centralizes all database connection parameters and settings
 */

require('dotenv').config();

module.exports = {
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT) || 8123,
    database: process.env.CLICKHOUSE_DATABASE || 'logs_db',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    max_open_connections: parseInt(process.env.CLICKHOUSE_MAX_OPEN_CONNECTIONS) || 10,
    request_timeout: 30000,
    compression: {
      request: true,
      response: true
    }
  },

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/observability_platform',
    options: {
      maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 10,
      minPoolSize: 2,
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS) || 10000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4, skip trying IPv6
    }
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'log-platform:',
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: false
  },

  performance: {
    batchSize: parseInt(process.env.BATCH_SIZE) || 10000,
    batchTimeout: parseInt(process.env.BATCH_TIMEOUT) || 1000,
    maxConcurrentBatches: parseInt(process.env.MAX_CONCURRENT_BATCHES) || 5,
    queryCacheTTL: parseInt(process.env.QUERY_CACHE_TTL) || 300
  }
};

