require('dotenv').config();
const { createClickHouseClient } = require('./src/config/database');

/**
 * Simple health check test
 */
async function testHealthCheck() {
  console.log('Testing ClickHouse health check...');

  try {
    const client = createClickHouseClient();

    // Test ping first
    console.log('Testing ping...');
    await client.ping();
    console.log('✅ Ping successful');

    // Test simple command
    console.log('Testing command...');
    await client.command({
      query: 'SELECT 1',
      clickhouse_settings: {
        max_execution_time: 5
      }
    });

    console.log('✅ Command test successful');
    console.log('✅ Health check should work now!');

    await client.close();

  } catch (error) {
    console.log('❌ Health check test failed:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 Make sure ClickHouse is running:');
      console.log('   docker-compose up -d');
    }
  }
}

testHealthCheck();
