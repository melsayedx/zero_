/**
 * Application Entry Point
 * Minimal log ingestion platform with clean architecture
 */

require('dotenv').config();
const express = require('express');
const { initClickHouse, initMongoDB } = require('./config/database');
const DIContainer = require('./config/di-container');
const { createRoutes } = require('./adapters/http/routes');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🚀 Starting Log Ingestion Platform...\n');

    // 1. Initialize databases
    console.log('📦 Initializing databases...');
    const clickhouseClient = await initClickHouse();
    const mongoDb = await initMongoDB();

    // 2. Setup dependency injection
    console.log('🔧 Wiring dependencies...');
    const container = new DIContainer();
    container.registerDatabases(clickhouseClient, mongoDb);
    container.build();

    // 3. Create Express app
    const app = express();
    app.use(express.json());

    // 4. Setup routes
    const logController = container.get('logController');
    const routes = createRoutes(logController);
    app.use(routes);

    // 5. Start server
    app.listen(PORT, () => {
      console.log('\n✅ Server ready!');
      console.log(`\n📍 Endpoints:`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   Ingest: POST http://localhost:${PORT}/api/logs`);
      console.log('\n💡 Example:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/logs \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"level":"INFO","message":"Hello","service":"test"}'`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

startServer();

