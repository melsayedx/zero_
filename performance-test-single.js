#!/usr/bin/env node

/**
 * Single-Request Performance Test Script
 * Tests log ingestion using individual POST requests (NO batching)
 * This demonstrates the performance difference between batch and single-request ingestion
 */

require('dotenv').config();
const { randomUUID } = require('crypto');

// Configuration
const TEST_CONFIG = {
  totalLogs: 10000,  // Much smaller number for individual requests
  applications: [
    { id: 'payment-service', weight: 0.30 },  // 30% of logs
    { id: 'auth-service', weight: 0.25 },     // 25% of logs
    { id: 'api-gateway', weight: 0.25 },      // 25% of logs
    { id: 'notification-service', weight: 0.20 } // 20% of logs
  ],
  concurrency: 10,  // Number of parallel requests
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000'
};

// Log levels with realistic distribution
const LOG_LEVELS = [
  { level: 'info', weight: 0.50 },
  { level: 'warn', weight: 0.25 },
  { level: 'error', weight: 0.15 },
  { level: 'debug', weight: 0.08 },
  { level: 'fatal', weight: 0.02 }
];

// Sample messages for each level
const MESSAGES = {
  info: [
    'Request processed successfully',
    'User logged in',
    'Transaction completed',
    'Cache hit',
    'API call successful'
  ],
  warn: [
    'High memory usage detected',
    'Slow query detected',
    'Rate limit approaching',
    'Cache miss',
    'Retry attempted'
  ],
  error: [
    'Database connection failed',
    'API timeout occurred',
    'Invalid request payload',
    'Authentication failed',
    'External service unavailable'
  ],
  debug: [
    'Processing request parameters',
    'Cache lookup initiated',
    'Validating user input',
    'Preparing database query',
    'Initializing service connection'
  ],
  fatal: [
    'System out of memory',
    'Database corruption detected',
    'Critical service failure',
    'Unrecoverable error occurred',
    'System shutdown initiated'
  ]
};

// Sources for each app
const SOURCES = {
  'payment-service': ['payment-processor', 'refund-handler', 'billing-engine'],
  'auth-service': ['login-handler', 'token-validator', 'session-manager'],
  'api-gateway': ['router', 'load-balancer', 'proxy'],
  'notification-service': ['email-sender', 'sms-sender', 'push-notifier']
};

// Statistics
const stats = {
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  totalResponseTime: 0,
  minResponseTime: Infinity,
  maxResponseTime: 0,
  responseTimePercentiles: [],
  errorsDetail: []
};

/**
 * Weighted random selection
 */
function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * total;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

/**
 * Generate a random log entry
 */
function generateLogEntry(appId) {
  const level = weightedRandom(LOG_LEVELS).level;
  const messages = MESSAGES[level];
  const sources = SOURCES[appId];
  
  return {
    app_id: appId,
    level: level,
    message: messages[Math.floor(Math.random() * messages.length)],
    source: sources[Math.floor(Math.random() * sources.length)],
    metadata: {
      environment: 'production',
      region: ['us-east-1', 'eu-west-1', 'ap-southeast-1'][Math.floor(Math.random() * 3)],
      request_id: randomUUID(),
      response_time_ms: Math.floor(Math.random() * 1000)
    },
    trace_id: Math.random() > 0.7 ? randomUUID() : null,
    user_id: Math.random() > 0.5 ? `user-${Math.floor(Math.random() * 10000)}` : null
  };
}

/**
 * Send a single log entry
 */
async function sendSingleLog(logEntry, logNumber) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${TEST_CONFIG.serverUrl}/api/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logEntry)
    });

    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${error.message || 'Unknown error'}`);
    }

    const result = await response.json();
    
    stats.successCount++;
    stats.totalResponseTime += responseTime;
    stats.minResponseTime = Math.min(stats.minResponseTime, responseTime);
    stats.maxResponseTime = Math.max(stats.maxResponseTime, responseTime);
    stats.responseTimePercentiles.push(responseTime);
    
    return { success: true, responseTime, result };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    stats.errorCount++;
    stats.errorsDetail.push({
      logNumber,
      error: error.message,
      responseTime,
      appId: logEntry.app_id
    });
    
    return { success: false, responseTime, error: error.message };
  }
}

/**
 * Process a queue of logs with controlled concurrency
 */
async function processLogsWithConcurrency(logs) {
  const results = [];
  let activeRequests = 0;
  let completedRequests = 0;
  let currentIndex = 0;
  
  const startTime = Date.now();
  let lastProgressUpdate = startTime;
  
  return new Promise((resolve, reject) => {
    const processNext = async () => {
      if (currentIndex >= logs.length && activeRequests === 0) {
        // All done
        resolve(results);
        return;
      }
      
      while (activeRequests < TEST_CONFIG.concurrency && currentIndex < logs.length) {
        const logIndex = currentIndex;
        const log = logs[currentIndex];
        currentIndex++;
        activeRequests++;
        
        sendSingleLog(log, logIndex + 1)
          .then(result => {
            results.push(result);
            activeRequests--;
            completedRequests++;
            
            // Update progress every 100ms
            const now = Date.now();
            if (now - lastProgressUpdate > 100) {
              const progress = (completedRequests / logs.length * 100).toFixed(1);
              const elapsed = ((now - startTime) / 1000).toFixed(1);
              const rate = (completedRequests / (now - startTime) * 1000).toFixed(0);
              process.stdout.write(`\r  Progress: ${progress}% (${completedRequests}/${logs.length}) | ${rate} logs/sec | ${elapsed}s elapsed`);
              lastProgressUpdate = now;
            }
            
            processNext();
          })
          .catch(error => {
            activeRequests--;
            completedRequests++;
            console.error(`\n❌ Request failed:`, error.message);
            processNext();
          });
      }
    };
    
    // Start initial batch of concurrent requests
    processNext();
  });
}

/**
 * Calculate percentiles
 */
function calculatePercentile(values, percentile) {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Run the performance test
 */
async function runPerformanceTest() {
  const workerId = process.env.WORKER_ID || 'standalone';
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Single-Request Log Ingestion Performance Test          ║');
  console.log('║   (No Batching - Individual POST requests)                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Test Configuration:');
  if (workerId !== 'standalone') {
    console.log(`   Worker ID: ${workerId}`);
  }
  console.log(`   Total Logs: ${TEST_CONFIG.totalLogs.toLocaleString()}`);
  console.log(`   Applications: ${TEST_CONFIG.applications.length}`);
  console.log(`   Concurrency: ${TEST_CONFIG.concurrency} parallel requests`);
  console.log(`   Server: ${TEST_CONFIG.serverUrl}`);
  console.log(`   Endpoint: POST /api/logs (single log per request)\n`);
  
  console.log('⚠️  Note: This test uses individual requests (no batching)');
  console.log('   Expected throughput will be MUCH lower than batch mode.\n');
  
  // Check server health
  console.log('🏥 Checking server health...');
  try {
    const healthResponse = await fetch(`${TEST_CONFIG.serverUrl}/health`);
    if (!healthResponse.ok) {
      throw new Error('Server is not healthy');
    }
    console.log('✅ Server is healthy\n');
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    console.error('   Make sure the server is running on', TEST_CONFIG.serverUrl);
    process.exit(1);
  }
  
  const overallStartTime = Date.now();
  
  // Calculate logs per app
  const logsPerApp = TEST_CONFIG.applications.map(app => ({
    appId: app.id,
    count: Math.floor(TEST_CONFIG.totalLogs * app.weight)
  }));
  
  console.log('📝 Generating logs...');
  const allLogs = [];
  logsPerApp.forEach(app => {
    for (let i = 0; i < app.count; i++) {
      allLogs.push(generateLogEntry(app.appId));
    }
  });
  console.log(`✅ Generated ${allLogs.length} logs\n`);
  
  console.log(`🚀 Sending logs with concurrency=${TEST_CONFIG.concurrency}...\n`);
  
  // Process logs with controlled concurrency
  await processLogsWithConcurrency(allLogs);
  
  console.log('\n'); // New line after progress
  
  const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  const overallThroughput = (stats.successCount / (Date.now() - overallStartTime) * 1000).toFixed(0);
  
  // Calculate response time statistics
  const avgResponseTime = (stats.totalResponseTime / stats.successCount).toFixed(0);
  const p50 = calculatePercentile(stats.responseTimePercentiles, 50);
  const p95 = calculatePercentile(stats.responseTimePercentiles, 95);
  const p99 = calculatePercentile(stats.responseTimePercentiles, 99);
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    Test Results                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('📈 Summary:');
  console.log(`   Total Duration: ${overallDuration}s`);
  console.log(`   Successful: ${stats.successCount.toLocaleString()} logs`);
  console.log(`   Failed: ${stats.errorCount.toLocaleString()} logs`);
  console.log(`   Overall Throughput: ${overallThroughput} logs/second`);
  console.log(`   Success Rate: ${(stats.successCount / (stats.successCount + stats.errorCount) * 100).toFixed(2)}%\n`);
  
  console.log('⏱️  Response Time Statistics:');
  console.log(`   Average: ${avgResponseTime}ms`);
  console.log(`   Min: ${stats.minResponseTime}ms`);
  console.log(`   Max: ${stats.maxResponseTime}ms`);
  console.log(`   p50 (median): ${p50}ms`);
  console.log(`   p95: ${p95}ms`);
  console.log(`   p99: ${p99}ms\n`);
  
  console.log('📊 Per Application:');
  const appCounts = {};
  allLogs.forEach(log => {
    appCounts[log.app_id] = (appCounts[log.app_id] || 0) + 1;
  });
  Object.entries(appCounts).forEach(([appId, count]) => {
    console.log(`   ${appId}: ${count.toLocaleString()} logs`);
  });
  
  if (stats.errorCount > 0) {
    console.log('\n❌ Errors Summary:');
    const errorsByType = {};
    stats.errorsDetail.forEach(err => {
      errorsByType[err.error] = (errorsByType[err.error] || 0) + 1;
    });
    Object.entries(errorsByType).forEach(([error, count]) => {
      console.log(`   ${error}: ${count} occurrences`);
    });
    
    if (stats.errorsDetail.length <= 10) {
      console.log('\n   First errors:');
      stats.errorsDetail.forEach(err => {
        console.log(`   - Log #${err.logNumber} (${err.appId}): ${err.error}`);
      });
    } else {
      console.log(`\n   Showing first 10 errors:`);
      stats.errorsDetail.slice(0, 10).forEach(err => {
        console.log(`   - Log #${err.logNumber} (${err.appId}): ${err.error}`);
      });
    }
  }
  
  console.log('\n🔄 Comparison Note:');
  console.log('   For comparison, run the batch test:');
  console.log('   node performance-test.js');
  console.log('\n   Expected: Batch mode is 10-100x faster!\n');
  
  console.log('✅ Single-request performance test completed!\n');
  console.log('💡 To query the logs in ClickHouse:');
  console.log('   docker exec -it log-platform-clickhouse clickhouse-client');
  console.log('   SELECT app_id, count() FROM logs_db.logs GROUP BY app_id;');
  console.log('   SELECT level, count() FROM logs_db.logs GROUP BY level;');
}

// Run the test
runPerformanceTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

