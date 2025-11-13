/**
 * Test Script: JSON Format (Backward Compatible)
 * Demonstrates that the existing JSON API still works
 */

const http = require('http');

async function testJsonFormat() {
  console.log('=== Testing JSON Format (Backward Compatibility) ===\n');

  try {
    // Create test log entries (JSON format - existing API)
    const logEntries = [
      {
        app_id: 'test-json-app',
        level: 'INFO',
        message: 'JSON format test log #1',
        source: 'json-test-client',
        environment: 'development',
        metadata: {
          format: 'json',
          test: 'backward-compatibility'
        }
      },
      {
        app_id: 'test-json-app',
        level: 'WARN',
        message: 'JSON format test log #2 - Warning',
        source: 'json-test-client',
        environment: 'development',
        metadata: {
          format: 'json',
          test: 'backward-compatibility'
        },
        trace_id: 'trace-json-123'
      },
      {
        app_id: 'test-json-app',
        level: 'ERROR',
        message: 'JSON format test log #3 - Error',
        source: 'json-test-client',
        environment: 'development',
        metadata: {
          format: 'json',
          test: 'backward-compatibility',
          errorCode: 'ERR_001'
        },
        trace_id: 'trace-json-123',
        user_id: 'user-json-test'
      }
    ];

    const jsonData = JSON.stringify(logEntries);

    console.log('JSON payload:');
    console.log('  - Number of entries:', logEntries.length);
    console.log('  - Payload size:', jsonData.length, 'bytes');
    console.log('  - Content-Type: application/json');
    console.log('\n');

    // Send HTTP POST request
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/logs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData)
      }
    };

    const response = await sendRequest(options, jsonData);
    
    console.log('Response:');
    console.log('  - Status:', response.statusCode);
    console.log('  - Body:', JSON.stringify(response.body, null, 2));
    console.log('\n');

    if (response.statusCode === 202) {
      console.log('✅ SUCCESS: JSON format still works (backward compatible)!');
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
testJsonFormat();

