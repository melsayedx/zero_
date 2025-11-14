require('dotenv').config();
const createApp = require('./app');
const { startHttp3Proxy } = require('./adapters/http3/server');

/**
 * Launch application with HTTP/3 support (via Caddy reverse proxy)
 */
async function startHttp3Server() {
  const HTTP_PORT = process.env.PORT || 3000;
  const HTTP3_PORT = process.env.HTTP3_PORT || 3003;
  const GRPC_PORT = process.env.GRPC_PORT || 50051;

  console.log('Starting application with HTTP/3 support...\n');

  // Start the regular HTTP/1.1 backend server
  const appInstance = await createApp();

  // Wait a bit for the backend to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Start Caddy reverse proxy for HTTP/3
    const http3Proxy = await startHttp3Proxy({
      port: HTTP3_PORT,
      backendPort: HTTP_PORT
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Log Ingestion Platform - HTTP/3 Mode                    ║
╚═══════════════════════════════════════════════════════════╝

HTTP/3 Proxy running on: https://localhost:${HTTP3_PORT} (via Caddy)
Backend HTTP/1.1 Server: http://localhost:${HTTP_PORT}
gRPC Server running on: 0.0.0.0:${GRPC_PORT}
Environment: ${process.env.NODE_ENV || 'development'}

HTTP/3 Features:
  ✓ QUIC Protocol (UDP-based)
  ✓ 0-RTT Connection Resumption
  ✓ Improved Loss Recovery
  ✓ No Head-of-Line Blocking
  ✓ HTTP/2 & HTTP/1.1 Fallback

HTTPS Endpoints (via HTTP/3):
  GET  /health             - Health check
  GET  /api/stats          - Performance stats
  POST /api/logs           - Ingest logs (JSON or Protocol Buffer)
  GET  /api/logs/:app_id   - Retrieve logs

Testing:
  curl --http3 -k https://localhost:${HTTP3_PORT}/health
  ./run-http3.sh

Note: HTTP/3 requires UDP port ${HTTP3_PORT} to be open
`);

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      // Stop Caddy first
      await http3Proxy.stop();
      
      // Then stop the backend
      await appInstance.shutdown();
      
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start HTTP/3 proxy:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Install Caddy: brew install caddy (macOS)');
    console.error('  2. Generate SSL certificates: npm run setup:certs');
    console.error('  3. Check if ports are available:');
    console.error(`     - UDP port ${HTTP3_PORT}: lsof -i UDP:${HTTP3_PORT}`);
    console.error(`     - TCP port ${HTTP_PORT}: lsof -i :${HTTP_PORT}`);
    console.error('  4. Verify Caddy is installed: caddy version\n');
    
    // Cleanup backend server
    await appInstance.shutdown();
    process.exit(1);
  }
}

if (require.main === module) {
  startHttp3Server();
}

module.exports = startHttp3Server;

