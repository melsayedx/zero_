/**
 * Performance Test: Protocol Buffer vs JSON
 * Compares ingestion performance and payload sizes between formats
 */

const protobuf = require('protobufjs');
const path = require('path');
const http = require('http');

const TEST_DURATION_MS = 10000; // 10 seconds
const BATCH_SIZE = 100; // Logs per batch

/**
 * Test Protocol Buffer batch ingestion performance
 */
async function testProtobufPerformance() {
  console.log('=== Protocol Buffer Performance Test ===\n');
  
  const protoPath = path.join(__dirname, 'proto/log-entry.proto');
  const root = await protobuf.load(protoPath);
  const LogEntryBatch = root.lookupType('logs.LogEntryBatch');

  let requestCount = 0;
  let totalLogs = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  // Create a batch of test logs
  const createBatch = () => {
    const entries = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      entries.push({
        appId: 'perf-test-protobuf',
        level: Math.floor(Math.random() * 5), // Random level
        message: `Performance test log message ${i} - ${Date.now()}`,
        source: 'perf-test-client',
        environment: 'load-test',
        metadata: {
          requestId: `req-${requestCount}`,
          batchIndex: `${i}`,
          timestamp: `${Date.now()}`
        },
        traceId: `trace-${requestCount}`,
        userId: `user-${Math.floor(Math.random() * 100)}`
      });
    }
    return { entries };
  };

  // Send requests continuously
  const sendBatch = async () => {
    const batchData = createBatch();
    const message = LogEntryBatch.create(batchData);
    const buffer = LogEntryBatch.encode(message).finish();
    
    totalBytes += buffer.length;

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

    try {
      await sendRequest(options, buffer);
      requestCount++;
      totalLogs += BATCH_SIZE;
    } catch (error) {
      console.error('Request failed:', error.message);
    }
  };

  // Run test for specified duration
  console.log(`Starting test for ${TEST_DURATION_MS / 1000} seconds...`);
  console.log(`Batch size: ${BATCH_SIZE} logs per request\n`);

  while (Date.now() - startTime < TEST_DURATION_MS) {
    await sendBatch();
  }

  const duration = (Date.now() - startTime) / 1000;
  const logsPerSecond = totalLogs / duration;
  const requestsPerSecond = requestCount / duration;
  const avgPayloadSize = totalBytes / requestCount;

  console.log('\n=== Protocol Buffer Results ===');
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Total Requests: ${requestCount}`);
  console.log(`Total Logs: ${totalLogs}`);
  console.log(`Requests/sec: ${requestsPerSecond.toFixed(2)}`);
  console.log(`Logs/sec: ${logsPerSecond.toFixed(0)}`);
  console.log(`Total Data: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Avg Payload Size: ${avgPayloadSize.toFixed(0)} bytes`);
  console.log(`Avg Bytes/Log: ${(avgPayloadSize / BATCH_SIZE).toFixed(2)} bytes`);

  return {
    format: 'protobuf',
    duration,
    requestCount,
    totalLogs,
    requestsPerSecond,
    logsPerSecond,
    totalBytes,
    avgPayloadSize,
    avgBytesPerLog: avgPayloadSize / BATCH_SIZE
  };
}

/**
 * Test JSON batch ingestion performance
 */
async function testJsonPerformance() {
  console.log('\n\n=== JSON Performance Test ===\n');
  
  let requestCount = 0;
  let totalLogs = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  // Create a batch of test logs
  const createBatch = () => {
    const entries = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      entries.push({
        app_id: 'perf-test-json',
        level: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][Math.floor(Math.random() * 5)],
        message: `Performance test log message ${i} - ${Date.now()}`,
        source: 'perf-test-client',
        environment: 'load-test',
        metadata: {
          requestId: `req-${requestCount}`,
          batchIndex: `${i}`,
          timestamp: `${Date.now()}`
        },
        trace_id: `trace-${requestCount}`,
        user_id: `user-${Math.floor(Math.random() * 100)}`
      });
    }
    return entries;
  };

  // Send requests continuously
  const sendBatch = async () => {
    const batchData = createBatch();
    const jsonData = JSON.stringify(batchData);
    
    totalBytes += Buffer.byteLength(jsonData);

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

    try {
      await sendRequest(options, jsonData);
      requestCount++;
      totalLogs += BATCH_SIZE;
    } catch (error) {
      console.error('Request failed:', error.message);
    }
  };

  // Run test for specified duration
  console.log(`Starting test for ${TEST_DURATION_MS / 1000} seconds...`);
  console.log(`Batch size: ${BATCH_SIZE} logs per request\n`);

  while (Date.now() - startTime < TEST_DURATION_MS) {
    await sendBatch();
  }

  const duration = (Date.now() - startTime) / 1000;
  const logsPerSecond = totalLogs / duration;
  const requestsPerSecond = requestCount / duration;
  const avgPayloadSize = totalBytes / requestCount;

  console.log('\n=== JSON Results ===');
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Total Requests: ${requestCount}`);
  console.log(`Total Logs: ${totalLogs}`);
  console.log(`Requests/sec: ${requestsPerSecond.toFixed(2)}`);
  console.log(`Logs/sec: ${logsPerSecond.toFixed(0)}`);
  console.log(`Total Data: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Avg Payload Size: ${avgPayloadSize.toFixed(0)} bytes`);
  console.log(`Avg Bytes/Log: ${(avgPayloadSize / BATCH_SIZE).toFixed(2)} bytes`);

  return {
    format: 'json',
    duration,
    requestCount,
    totalLogs,
    requestsPerSecond,
    logsPerSecond,
    totalBytes,
    avgPayloadSize,
    avgBytesPerLog: avgPayloadSize / BATCH_SIZE
  };
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
        if (res.statusCode === 202) {
          resolve({ statusCode: res.statusCode });
        } else {
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    
    if (Buffer.isBuffer(data)) {
      req.write(data);
    } else {
      req.write(data, 'utf8');
    }
    
    req.end();
  });
}

/**
 * Main test runner
 */
async function runPerformanceComparison() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Protocol Buffer vs JSON Performance Comparison      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Run Protocol Buffer test
    const protobufResults = await testProtobufPerformance();
    
    // Wait a bit between tests
    console.log('\nWaiting 2 seconds before JSON test...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run JSON test
    const jsonResults = await testJsonPerformance();

    // Compare results
    console.log('\n\n╔════════════════════════════════════════════════════════╗');
    console.log('║              COMPARISON SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    const payloadReduction = ((jsonResults.avgPayloadSize - protobufResults.avgPayloadSize) / jsonResults.avgPayloadSize * 100);
    const bytesPerLogReduction = ((jsonResults.avgBytesPerLog - protobufResults.avgBytesPerLog) / jsonResults.avgBytesPerLog * 100);
    const throughputDiff = ((protobufResults.logsPerSecond - jsonResults.logsPerSecond) / jsonResults.logsPerSecond * 100);

    console.log('Payload Size:');
    console.log(`  - Protocol Buffer: ${protobufResults.avgPayloadSize.toFixed(0)} bytes`);
    console.log(`  - JSON: ${jsonResults.avgPayloadSize.toFixed(0)} bytes`);
    console.log(`  - Reduction: ${payloadReduction.toFixed(1)}% smaller with Protobuf`);
    console.log('');

    console.log('Bytes per Log:');
    console.log(`  - Protocol Buffer: ${protobufResults.avgBytesPerLog.toFixed(2)} bytes`);
    console.log(`  - JSON: ${jsonResults.avgBytesPerLog.toFixed(2)} bytes`);
    console.log(`  - Reduction: ${bytesPerLogReduction.toFixed(1)}% smaller with Protobuf`);
    console.log('');

    console.log('Throughput:');
    console.log(`  - Protocol Buffer: ${protobufResults.logsPerSecond.toFixed(0)} logs/sec`);
    console.log(`  - JSON: ${jsonResults.logsPerSecond.toFixed(0)} logs/sec`);
    console.log(`  - Difference: ${throughputDiff > 0 ? '+' : ''}${throughputDiff.toFixed(1)}%`);
    console.log('');

    console.log('Bandwidth Savings:');
    console.log(`  - Protocol Buffer: ${(protobufResults.totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - JSON: ${(jsonResults.totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Saved: ${((jsonResults.totalBytes - protobufResults.totalBytes) / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    console.log('✅ Performance comparison completed!');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

// Run the comparison
runPerformanceComparison();

