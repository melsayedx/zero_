/**
 * Test: Batch Buffer Performance
 * Demonstrates the intelligent batching and measures performance improvement
 */

const http = require('http');

// Helper to send logs
async function sendLogs(logs, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(logs);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/logs',
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ 
            statusCode: res.statusCode, 
            body: JSON.parse(body) 
          });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runBatchBufferTest() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        Batch Buffer Performance Test                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log('This test demonstrates intelligent batching to ClickHouse\n');
  console.log('Scenario: Send 100 requests with 100 logs each (10,000 total)');
  console.log('Expected: Buffer accumulates and flushes once at 10K threshold\n');
  
  const totalRequests = 100;
  const logsPerRequest = 100;
  const totalLogs = totalRequests * logsPerRequest;
  
  console.log('━━━ Starting test ━━━\n');
  
  const startTime = Date.now();
  let requestsSent = 0;
  
  // Send requests in parallel (simulates high load)
  const promises = [];
  
  for (let i = 0; i < totalRequests; i++) {
    const logs = Array.from({ length: logsPerRequest }, (_, j) => ({
      app_id: 'batch-buffer-test',
      level: ['DEBUG', 'INFO', 'WARN', 'ERROR'][j % 4],
      message: `Batch buffer test log ${i * logsPerRequest + j}`,
      source: 'batch-buffer-test',
      environment: 'test',
      metadata: {
        requestNum: i,
        logNum: j,
        timestamp: Date.now()
      }
    }));
    
    promises.push(
      sendLogs(logs).then(response => {
        requestsSent++;
        if (requestsSent % 10 === 0) {
          console.log(`  Sent ${requestsSent}/${totalRequests} requests (${requestsSent * logsPerRequest} logs)...`);
        }
        return response;
      })
    );
  }
  
  // Wait for all requests to complete
  console.log('Sending requests in parallel...\n');
  const responses = await Promise.all(promises);
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log('\n━━━ Test Results ━━━\n');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Total Logs Sent: ${totalLogs.toLocaleString()}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Throughput: ${Math.round((totalLogs / duration) * 1000).toLocaleString()} logs/sec`);
  console.log(`Request Rate: ${Math.round((totalRequests / duration) * 1000)} req/sec\n`);
  
  // Check success rate
  const successfulRequests = responses.filter(r => r.statusCode === 202).length;
  console.log(`Successful Requests: ${successfulRequests}/${totalRequests} (${((successfulRequests / totalRequests) * 100).toFixed(1)}%)\n`);
  
  // Wait a bit for buffer to flush
  console.log('Waiting 2 seconds for buffer to flush...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check buffer stats
  console.log('━━━ Checking Buffer Stats ━━━\n');
  try {
    const statsResponse = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/stats', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ error: 'Failed to parse response' });
          }
        });
      }).on('error', reject);
    });
    
    if (statsResponse.buffer) {
      console.log('Buffer Metrics:');
      console.log(`  Total Logs Buffered: ${statsResponse.buffer.totalLogsBuffered.toLocaleString()}`);
      console.log(`  Total Logs Inserted: ${statsResponse.buffer.totalLogsInserted.toLocaleString()}`);
      console.log(`  Total Flushes: ${statsResponse.buffer.totalFlushes}`);
      console.log(`  Avg Batch Size: ${statsResponse.buffer.avgBatchSize.toLocaleString()}`);
      console.log(`  Current Buffer Size: ${statsResponse.buffer.currentBufferSize}`);
      console.log(`  Last Flush: ${statsResponse.buffer.lastFlushTime || 'N/A'}`);
      console.log(`  Last Flush Size: ${statsResponse.buffer.lastFlushSize.toLocaleString()}`);
      console.log(`  Errors: ${statsResponse.buffer.totalErrors}\n`);
      
      // Calculate efficiency
      const insertsPerFlush = statsResponse.buffer.totalLogsInserted / statsResponse.buffer.totalFlushes;
      console.log(`Efficiency Analysis:`);
      console.log(`  Average logs per ClickHouse insert: ${Math.round(insertsPerFlush).toLocaleString()}`);
      console.log(`  vs. Without batching: 1 request = 1 insert (100 logs each)`);
      console.log(`  Reduction in ClickHouse operations: ${Math.round((1 - (statsResponse.buffer.totalFlushes / totalRequests)) * 100)}%\n`);
      
      if (statsResponse.buffer.totalFlushes === 1) {
        console.log('✅ SUCCESS: All logs flushed in a SINGLE batch to ClickHouse!');
        console.log('   This is optimal - buffer accumulated all 10K logs and flushed once.\n');
      } else if (statsResponse.buffer.totalFlushes <= 3) {
        console.log('✅ GOOD: Logs flushed in just ' + statsResponse.buffer.totalFlushes + ' batches.');
        console.log('   This is efficient - much better than 100 separate inserts.\n');
      } else {
        console.log('⚠️  Buffer flushed ' + statsResponse.buffer.totalFlushes + ' times.');
        console.log('   Still better than per-request inserts, but could be more efficient.\n');
      }
    } else {
      console.log('⚠️  Buffer metrics not available in stats endpoint\n');
    }
  } catch (error) {
    console.error('Error fetching stats:', error.message);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Key Benefits of Batch Buffer:\n');
  console.log('1. Reduces ClickHouse server load (fewer insert operations)');
  console.log('2. Improves compression efficiency (larger batches compress better)');
  console.log('3. Better network utilization (fewer HTTP requests)');
  console.log('4. Lower ClickHouse CPU usage (fewer merge operations)');
  console.log('5. Higher overall throughput\n');
  
  console.log('🎉 Test complete!\n');
}

// Run test
console.log('Starting batch buffer test in 1 second...\n');
setTimeout(() => {
  runBatchBufferTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}, 1000);

