/**
 * Test Script: Protocol Buffer Single Entry Ingestion
 * Demonstrates sending a single log entry using Protocol Buffer format
 */

const protobuf = require('protobufjs');
const path = require('path');
const http = require('http');

async function testProtobufSingleEntry() {
  console.log('=== Testing Protocol Buffer Single Entry Ingestion ===\n');

  try {
    // Load protobuf schema
    const protoPath = path.join(__dirname, 'proto/log-entry.proto');
    const root = await protobuf.load(protoPath);
    const LogEntry = root.lookupType('logs.LogEntry');

    // Create a test log entry
    const logData = {
      appId: 'test-protobuf-app',
      level: 1, // INFO
      message: 'This is a test log message sent via Protocol Buffer',
      source: 'test-protobuf-client',
      environment: 'development',
      metadata: {
        requestId: '12345',
        userId: 'user-001',
        ipAddress: '192.168.1.100'
      },
      traceId: 'trace-abc-123',
      userId: 'user-001'
    };

    // Verify the message
    const errMsg = LogEntry.verify(logData);
    if (errMsg) {
      throw new Error(`Invalid log data: ${errMsg}`);
    }

    // Create and encode the message
    const message = LogEntry.create(logData);
    const buffer = LogEntry.encode(message).finish();

    console.log('Encoded log entry:');
    console.log('  - Buffer size:', buffer.length, 'bytes');
    console.log('  - App ID:', logData.appId);
    console.log('  - Level:', logData.level, '(INFO)');
    console.log('  - Message:', logData.message);
    console.log('  - Source:', logData.source);
    console.log('\n');

    // Send HTTP POST request
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Content-Length': buffer.length
      }
    };

    const response = await sendRequest(options, buffer);
    
    console.log('Response:');
    console.log('  - Status:', response.statusCode);
    console.log('  - Body:', response.body);
    console.log('\n');

    if (response.statusCode === 202) {
      console.log('✅ SUCCESS: Log entry ingested successfully via Protocol Buffer!');
    } else {
      console.log('❌ FAILED: Unexpected status code:', response.statusCode);
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

/**
 * Helper function to send HTTP request
 */
function sendRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          resolve({ statusCode: res.statusCode, body: parsedBody });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Run the test
testProtobufSingleEntry();

