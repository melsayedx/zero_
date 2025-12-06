require('dotenv').config();
const createApp = require('./app');
const { createHttp2Server } = require('./infrastructure/http2/server');

/**
 * Launch application with HTTP/2 support
 */
async function startHttp2Server() {
  const HTTP2_PORT = process.env.HTTP2_PORT || 3001;
  const GRPC_PORT = process.env.GRPC_PORT || 50051;

  console.log('Starting application with HTTP/2 support...\n');

  // Create the Fastify app (without starting HTTP/1.1 server)
  // We'll manually handle the HTTP/2 server
  const appInstance = await createApp({ skipListen: true });

  try {
    // Create HTTP/2 server with the Express app
    const http2Server = createHttp2Server(appInstance.app, {
      port: HTTP2_PORT,
      onListen: (port) => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - HTTP/2 Mode                    ║
╚═══════════════════════════════════════════════════════════╝

HTTP/2 Server running on: https://localhost:${port}
gRPC Server running on: 0.0.0.0:${GRPC_PORT}
Environment: ${process.env.NODE_ENV || 'development'}

HTTP/2 Features:
  ✓ Multiplexing (multiple requests over single connection)
  ✓ Server Push (when implemented)
  ✓ Header Compression (HPACK)
  ✓ Binary Protocol
  ✓ HTTP/1.1 Fallback (enabled)

HTTPS Endpoints:
  GET  /health             - Health check
  GET  /api/stats          - Performance stats
  POST /api/logs           - Ingest logs (JSON or Protocol Buffer)
  GET  /api/logs/:app_id   - Retrieve logs

Supported Content Types:
  - application/json              (JSON format)
  - application/x-protobuf        (Protocol Buffer - single entry)
  - application/x-protobuf-batch  (Protocol Buffer - batch)

Testing:
  curl --http2 -k https://localhost:${port}/health
  ./run-http2.sh
`);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      return new Promise((resolve) => {
        http2Server.close(async () => {
          console.log('HTTP/2 server closed');
          await appInstance.shutdown();
          resolve();
        });
      });
    };

    process.on('SIGTERM', async () => {
      await shutdown('SIGTERM');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await shutdown('SIGINT');
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start HTTP/2 server:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Generate SSL certificates: npm run setup:certs');
    console.error('  2. Check if port is available: lsof -i :' + HTTP2_PORT);
    console.error('  3. Verify certificate paths in .env file\n');
    process.exit(1);
  }
}

if (require.main === module) {
  startHttp2Server();
}

module.exports = startHttp2Server;

