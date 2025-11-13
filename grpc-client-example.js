/**
 * Example gRPC Client for Log Ingestion Platform
 * 
 * This script demonstrates how to use the gRPC API to:
 * 1. Check service health
 * 2. Ingest log entries
 * 3. Query logs by app_id
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto file
const PROTO_PATH = path.join(__dirname, 'proto/logs.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const logsProto = grpc.loadPackageDefinition(packageDefinition).logs;

// Create client
const client = new logsProto.LogService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

// 1. Health Check
function healthCheck() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Health Check ===');
    client.HealthCheck({}, (error, response) => {
      if (error) {
        console.error('Error:', error);
        reject(error);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        resolve(response);
      }
    });
  });
}

// 2. Ingest Logs
function ingestLogs() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Ingest Logs ===');
    
    // Note: id and timestamp are NOT sent - server generates these automatically
    const logs = [
      {
        app_id: 'api-service',
        level: 'ERROR',
        message: 'Database connection failed',
        source: 'api-server-01',          // REQUIRED
        environment: 'production',
        metadata: {
          region: 'us-east-1',
          error_code: 'DB_CONN_001'
        },
        trace_id: 'trace-' + Math.random().toString(36).substring(7),
        user_id: ''
      },
      {
        app_id: 'api-service',
        level: 'INFO',
        message: 'User logged in successfully',
        source: 'api-server-01',          // REQUIRED
        environment: 'production',
        metadata: {
          ip_address: '192.168.1.1'
        },
        trace_id: 'trace-' + Math.random().toString(36).substring(7),
        user_id: 'user-123'
      },
      {
        app_id: 'payment-service',
        level: 'WARN',
        message: 'Payment processing taking longer than expected',
        source: 'payment-worker-03',      // REQUIRED
        environment: 'production',
        metadata: {
          transaction_id: 'txn-789',
          duration_ms: '5000'
        },
        trace_id: 'trace-' + Math.random().toString(36).substring(7),
        user_id: 'user-456'
      }
    ];

    console.log('Sending', logs.length, 'log entries...');

    client.IngestLogs({ logs }, (error, response) => {
      if (error) {
        console.error('Error:', error);
        reject(error);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        resolve(response);
      }
    });
  });
}

// 3. Get Logs by App ID
function getLogsByAppId(appId = 'api-service', limit = 10) {
  return new Promise((resolve, reject) => {
    console.log('\n=== Get Logs by App ID ===');
    console.log('App ID:', appId, '| Limit:', limit);

    client.GetLogsByAppId({ app_id: appId, limit }, (error, response) => {
      if (error) {
        console.error('Error:', error);
        reject(error);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        console.log('\nRetrieved', response.count, 'logs');
        
        // Display first few logs
        if (response.logs && response.logs.length > 0) {
          console.log('\nSample logs:');
          response.logs.slice(0, 3).forEach((log, index) => {
            console.log(`\n  Log ${index + 1}:`);
            console.log(`    Timestamp: ${log.timestamp}`);
            console.log(`    Level: ${log.level}`);
            console.log(`    Message: ${log.message}`);
            console.log(`    Metadata:`, log.metadata);
          });
        }
        
        resolve(response);
      }
    });
  });
}

// Run all examples
async function runExamples() {
  try {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   gRPC Client Example - Log Ingestion Platform       ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    // Step 1: Health check
    await healthCheck();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Ingest some logs
    await ingestLogs();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Query logs
    await getLogsByAppId('api-service', 10);

    console.log('\n✅ All operations completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples();
}

// Export functions for use in other scripts
module.exports = {
  client,
  healthCheck,
  ingestLogs,
  getLogsByAppId
};

