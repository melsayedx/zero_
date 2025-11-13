/**
 * Test Script: Protocol Buffer Batch Ingestion
 * Demonstrates sending multiple log entries using Protocol Buffer batch format
 */

const protobuf = require('protobufjs');
const path = require('path');
const http = require('http');

async function testProtobufBatch() {
  console.log('=== Testing Protocol Buffer Batch Ingestion ===\n');

  try {
    // Load protobuf schema
    const protoPath = path.join(__dirname, 'proto/log-entry.proto');
    const root = await protobuf.load(protoPath);
    const LogEntryBatch = root.lookupType('logs.LogEntryBatch');

    // Create multiple test log entries
    const logEntries = [
      {
        appId: 'test-batch-app',
        level: 1, // INFO
        message: 'Batch log entry #1',
        source: 'batch-test-client',
        environment: 'production',
        metadata: {
          batchId: 'batch-001',
          sequence: '1'
        }
      },
      {
        appId: 'test-batch-app',
        level: 2, // WARN
        message: 'Batch log entry #2 - Warning detected',
        source: 'batch-test-client',
        environment: 'production',
        metadata: {
          batchId: 'batch-001',
          sequence: '2'
        },
        traceId: 'trace-batch-xyz'
      },
      {
        appId: 'test-batch-app',
        level: 3, // ERROR
        message: 'Batch log entry #3 - Error occurred',
        source: 'batch-test-client',
        environment: 'production',
        metadata: {
          batchId: 'batch-001',
          sequence: '3',
          errorCode: '500'
        },
        traceId: 'trace-batch-xyz',
        userId: 'user-batch-test'
      }
    ];

    // Create batch message
    const batchData = {
      entries: logEntries
    };

    // Verify the message
    const errMsg = LogEntryBatch.verify(batchData);
    if (errMsg) {
      throw new Error(`Invalid batch data: ${errMsg}`);
    }

    // Create and encode the message
    const message = LogEntryBatch.create(batchData);
    const buffer = LogEntryBatch.encode(message).finish();

    console.log('Encoded log batch:');
    console.log('  - Number of entries:', logEntries.length);
    console.log('  - Buffer size:', buffer.length, 'bytes');
    console.log('  - Avg bytes per entry:', Math.round(buffer.length / logEntries.length), 'bytes');
    console.log('\n');

    logEntries.forEach((entry, index) => {
      const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][entry.level];
      console.log(`Entry ${index + 1}:`);
      console.log('  - Level:', levelName);
      console.log('  - Message:', entry.message);
    });
    console.log('\n');

    // Send HTTP POST request
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf-batch',
        'Content-Length': buffer.length
      }
    };

    const response = await sendRequest(options, buffer);
    
    console.log('Response:');
    console.log('  - Status:', response.statusCode);
    console.log('  - Body:', JSON.stringify(response.body, null, 2));
    console.log('\n');

    if (response.statusCode === 202) {
      console.log('✅ SUCCESS: Log batch ingested successfully via Protocol Buffer!');
    } else {
      console.log('❌ FAILED: Unexpected status code:', response.statusCode);
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
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
testProtobufBatch();

