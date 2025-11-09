const { createClient } = require('@clickhouse/client');

/**
 * Create and configure ClickHouse client
 * @returns {ClickHouseClient} Configured ClickHouse client
 */
function createClickHouseClient() {
  const client = createClient({
    host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DATABASE || 'logs_db',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    request_timeout: 30000,
    compression: {
      request: true,
      response: true
    }
  });

  return client;
}

module.exports = {
  createClickHouseClient
};

