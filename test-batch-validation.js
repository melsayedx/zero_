/**
 * Test: Batch Validation Integration Test
 * Verifies the new batch validation works correctly
 */

const http = require('http');

// Helper to send request
function sendRequest(data, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const payload = contentType === 'application/json' 
      ? JSON.stringify(data)
      : data;

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

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Batch Validation Integration Test                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Small batch (10 logs)
  console.log('Test 1: Small batch (10 logs)...');
  try {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      app_id: 'test-batch',
      level: 'INFO',
      message: `Batch validation test log ${i}`,
      source: 'test-client'
    }));

    const response = await sendRequest(logs);
    if (response.statusCode === 202 && response.body.success) {
      console.log(`✅ PASS - Accepted ${response.body.stats.accepted} logs`);
      console.log(`   Throughput: ${response.body.stats.throughput}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Status: ${response.statusCode}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL - Error: ${error.message}\n`);
    failed++;
  }

  // Test 2: Medium batch (100 logs)
  console.log('Test 2: Medium batch (100 logs)...');
  try {
    const logs = Array.from({ length: 100 }, (_, i) => ({
      app_id: 'test-batch',
      level: ['DEBUG', 'INFO', 'WARN', 'ERROR'][i % 4],
      message: `Medium batch test log ${i} with some content`,
      source: 'test-client',
      metadata: {
        index: i,
        batch: 'medium'
      }
    }));

    const response = await sendRequest(logs);
    if (response.statusCode === 202 && response.body.success) {
      console.log(`✅ PASS - Accepted ${response.body.stats.accepted} logs`);
      console.log(`   Throughput: ${response.body.stats.throughput}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Status: ${response.statusCode}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL - Error: ${error.message}\n`);
    failed++;
  }

  // Test 3: Large batch (1000 logs)
  console.log('Test 3: Large batch (1000 logs)...');
  try {
    const logs = Array.from({ length: 1000 }, (_, i) => ({
      app_id: `app-${i % 10}`,
      level: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][i % 5],
      message: `Large batch test log ${i} with additional content to make it realistic`,
      source: `service-${i % 5}`,
      environment: 'production',
      metadata: {
        index: i,
        batch: 'large',
        timestamp: Date.now()
      },
      trace_id: `trace-${i}`,
      user_id: `user-${i % 100}`
    }));

    const response = await sendRequest(logs);
    if (response.statusCode === 202 && response.body.success) {
      console.log(`✅ PASS - Accepted ${response.body.stats.accepted} logs`);
      console.log(`   Throughput: ${response.body.stats.throughput}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Status: ${response.statusCode}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL - Error: ${error.message}\n`);
    failed++;
  }

  // Test 4: Mixed valid/invalid batch
  console.log('Test 4: Mixed valid/invalid batch (should accept valid, reject invalid)...');
  try {
    const logs = [
      { app_id: 'test', level: 'INFO', message: 'Valid log 1', source: 'test' },
      { app_id: 'test', level: 'INVALID', message: 'Invalid log', source: 'test' }, // Invalid level
      { app_id: 'test', level: 'INFO', message: 'Valid log 2', source: 'test' },
      { level: 'INFO', message: 'Missing app_id', source: 'test' }, // Missing app_id
      { app_id: 'test', level: 'INFO', message: 'Valid log 3', source: 'test' }
    ];

    const response = await sendRequest(logs);
    if (response.statusCode === 202 && 
        response.body.stats.accepted === 3 && 
        response.body.stats.rejected === 2) {
      console.log(`✅ PASS - Correctly accepted ${response.body.stats.accepted}, rejected ${response.body.stats.rejected}`);
      console.log(`   Throughput: ${response.body.stats.throughput}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Expected 3 accepted, 2 rejected`);
      console.log(`   Got: ${response.body.stats.accepted} accepted, ${response.body.stats.rejected} rejected\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL - Error: ${error.message}\n`);
    failed++;
  }

  // Test 5: Single log (edge case)
  console.log('Test 5: Single log (controller should convert to array)...');
  try {
    const log = {
      app_id: 'test-single',
      level: 'INFO',
      message: 'Single log test',
      source: 'test-client'
    };

    const response = await sendRequest(log);
    if (response.statusCode === 202 && response.body.success) {
      console.log(`✅ PASS - Single log accepted`);
      console.log(`   Stats: ${response.body.stats.accepted} accepted\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Status: ${response.statusCode}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL - Error: ${error.message}\n`);
    failed++;
  }

  // Test 6: Empty array (should fail)
  console.log('Test 6: Empty array (should return error)...');
  try {
    const response = await sendRequest([]);
    if (response.statusCode === 500) {
      console.log(`✅ PASS - Correctly rejected empty array\n`);
      passed++;
    } else {
      console.log(`❌ FAIL - Should reject empty array (got status ${response.statusCode})\n`);
      failed++;
    }
  } catch (error) {
    console.log(`✅ PASS - Correctly rejected empty array (${error.message})\n`);
    passed++;
  }

  // Performance test
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Performance Test: Sustained throughput');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const batchSizes = [100, 500, 1000];
  for (let i = 0; i < batchSizes.length; i++) {
    const size = batchSizes[i];
    console.log(`Testing ${size} logs per batch...`);
    const logs = Array.from({ length: size }, (_, i) => ({
      app_id: 'perf-test',
      level: 'INFO',
      message: `Performance test log ${i}`,
      source: 'perf-test',
      metadata: { index: i }
    }));

    const start = Date.now();
    const response = await sendRequest(logs);
    const duration = Date.now() - start;

    if (response.statusCode === 202) {
      console.log(`  ✅ ${size} logs in ${duration}ms`);
      console.log(`     Server reported: ${response.body.stats.throughput}`);
      console.log(`     End-to-end: ${Math.round((size / duration) * 1000)} logs/sec\n`);
    }
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                   TEST SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`Total Tests: ${passed + failed}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed! Batch validation is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
  }
}

// Run tests
console.log('Starting tests in 1 second...\n');
setTimeout(() => {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}, 1000);

