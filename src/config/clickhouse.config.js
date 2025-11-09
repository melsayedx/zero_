/**
 * ClickHouse Specific Configuration
 * Handles ClickHouse client initialization and connection management
 */

const { createClient } = require('@clickhouse/client');
const dbConfig = require('./database.config');
const logger = require('../utils/logger');

let clickhouseClient = null;

/**
 * Initialize ClickHouse client with connection pooling
 * @returns {Object} ClickHouse client instance
 */
const initClickHouse = async () => {
  if (clickhouseClient) {
    return clickhouseClient;
  }

  try {
    const config = dbConfig.clickhouse;
    
    clickhouseClient = createClient({
      host: `http://${config.host}:${config.port}`,
      username: config.username,
      password: config.password,
      database: config.database,
      request_timeout: config.request_timeout,
      max_open_connections: config.max_open_connections,
      compression: config.compression,
      clickhouse_settings: {
        // Optimize for bulk inserts
        async_insert: 1,
        wait_for_async_insert: 0,
        async_insert_max_data_size: '10485760', // 10MB
        async_insert_busy_timeout_ms: 1000,
        
        // Performance optimizations
        max_execution_time: 30,
        max_block_size: 100000,
        max_insert_block_size: 1048576,
        
        // Enable parallel processing
        max_threads: 4
      }
    });

    // Test connection
    const result = await clickhouseClient.query({
      query: 'SELECT 1 as ping',
      format: 'JSONEachRow'
    });
    
    await result.json();
    logger.info('ClickHouse connected successfully', {
      host: config.host,
      database: config.database
    });

    return clickhouseClient;
  } catch (error) {
    logger.error('Failed to initialize ClickHouse', { error: error.message });
    throw error;
  }
};

/**
 * Get existing ClickHouse client instance
 * @returns {Object} ClickHouse client
 */
const getClickHouseClient = () => {
  if (!clickhouseClient) {
    throw new Error('ClickHouse client not initialized. Call initClickHouse() first.');
  }
  return clickhouseClient;
};

/**
 * Close ClickHouse connection
 */
const closeClickHouse = async () => {
  if (clickhouseClient) {
    await clickhouseClient.close();
    clickhouseClient = null;
    logger.info('ClickHouse connection closed');
  }
};

/**
 * Health check for ClickHouse
 * @returns {Promise<boolean>} Connection status
 */
const healthCheck = async () => {
  try {
    const client = getClickHouseClient();
    const result = await client.query({
      query: 'SELECT 1',
      format: 'JSONEachRow'
    });
    await result.json();
    return true;
  } catch (error) {
    logger.error('ClickHouse health check failed', { error: error.message });
    return false;
  }
};

module.exports = {
  initClickHouse,
  getClickHouseClient,
  closeClickHouse,
  healthCheck
};

