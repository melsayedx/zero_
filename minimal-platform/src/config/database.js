/**
 * Database Configuration
 * Initializes database connections
 */

const { createClient } = require('@clickhouse/client');
const { MongoClient } = require('mongodb');

/**
 * Initialize ClickHouse client
 */
async function initClickHouse() {
  const client = createClient({
    host: `http://${process.env.CLICKHOUSE_HOST}:${process.env.CLICKHOUSE_PORT}`,
    database: process.env.CLICKHOUSE_DATABASE
  });

  // Test connection
  await client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
  
  // Ensure table exists
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS logs (
        timestamp DateTime64(9),
        level String,
        message String,
        service String,
        metadata String
      ) ENGINE = MergeTree()
      ORDER BY (timestamp, service)
    `
  });

  console.log('✓ ClickHouse connected');
  return client;
}

/**
 * Initialize MongoDB client
 */
async function initMongoDB() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  
  const db = client.db();
  
  console.log('✓ MongoDB connected');
  return db;
}

module.exports = { initClickHouse, initMongoDB };

