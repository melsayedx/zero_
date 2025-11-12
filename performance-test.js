#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

/**
 * Performance Test Script
 * Tests log ingestion with 300k logs from 4 different applications in parallel
 */

const { randomUUID } = require('crypto');

// Configuration
const TEST_CONFIG = {
  totalLogs: 2000000,
  applications: [
    { id: 'payment-service', weight: 0.30 },  // 30% of logs
    { id: 'auth-service', weight: 0.25 },     // 25% of logs
    { id: 'api-gateway', weight: 0.25 },      // 25% of logs
    { id: 'notification-service', weight: 0.20 } // 20% of logs
  ],
  batchSize: 1000,  // Send logs in batches of 1000
  parallelWorkers: 4,
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

/**
 * Weighted random selection
 */
function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * total;
  
  for (const item of items) {
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
    environment: 'production',
    metadata: {
      region: ['us-east-1', 'eu-west-1', 'ap-southeast-1'][Math.floor(Math.random() * 3)],
      request_id: randomUUID(),
      response_time_ms: Math.floor(Math.random() * 1000)
    },
    trace_id: Math.random() > 0.7 ? randomUUID() : null,
    user_id: Math.random() > 0.5 ? `user-${Math.floor(Math.random() * 10000)}` : null
  };
}

/**
 * Send logs in batch
 */
async function sendBatch(logs, batchNumber, appId) {
  
  try {
    const response = await fetch(`${TEST_CONFIG.serverUrl}/api/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logs)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${error.message || 'Unknown error'}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Batch ${batchNumber} for ${appId} failed:`, error.message);
    throw error;
  }
}

/**
 * Generate and send logs for a specific application
 */
async function generateLogsForApp(appId, count, startIndex) {
  const batches = [];
  let currentBatch = [];
  let successCount = 0;
  let errorCount = 0;
  
  console.log(`📝 Generating ${count} logs for ${appId}...`);
  
  // Generate all logs
  const logs = [];
  for (let i = 0; i < count; i++) {
    logs.push(generateLogEntry(appId));
  }
  
  // Split into batches
  for (let i = 0; i < logs.length; i += TEST_CONFIG.batchSize) {
    batches.push(logs.slice(i, i + TEST_CONFIG.batchSize));
  }
  
  console.log(`📦 Sending ${batches.length} batches for ${appId}...`);
  
  const startTime = Date.now();
  
  // Send batches
  for (let i = 0; i < batches.length; i++) {
    try {
      await sendBatch(batches[i], startIndex + i, appId);
      successCount += batches[i].length;
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        const progress = ((i + 1) / batches.length * 100).toFixed(1);
        process.stdout.write(`\r  ${appId}: ${progress}% (${successCount}/${count} logs)`);
      }
    } catch (error) {
      errorCount += batches[i].length;
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const logsPerSecond = (successCount / (Date.now() - startTime) * 1000).toFixed(0);
  
  console.log(`\n✅ ${appId}: ${successCount} logs sent in ${duration}s (${logsPerSecond} logs/sec)`);
  
  return { successCount, errorCount, duration, logsPerSecond };
}

/**
 * Create batch endpoint (for testing)
 */
async function createBatchEndpoint() {
  console.log('📝 Note: This test assumes a /api/logs/batch endpoint exists.');
  console.log('   If it doesn\'t, the test will use individual /api/logs calls (slower).\n');
}

/**
 * Run the performance test
 */
async function runPerformanceTest() {
  const workerId = process.env.WORKER_ID || 'standalone';
  const workerPrefix = workerId !== 'standalone' ? `[Worker ${workerId}] ` : '';
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log(`║        Log Ingestion Performance Test ${workerPrefix.padStart(16)}║`);
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Test Configuration:');
  if (workerId !== 'standalone') {
    console.log(`   Worker ID: ${workerId}`);
  }
  console.log(`   Total Logs: ${TEST_CONFIG.totalLogs.toLocaleString()}`);
  console.log(`   Applications: ${TEST_CONFIG.applications.length}`);
  console.log(`   Batch Size: ${TEST_CONFIG.batchSize}`);
  console.log(`   Server: ${TEST_CONFIG.serverUrl}\n`);
  
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
  
  await createBatchEndpoint();
  
  const overallStartTime = Date.now();
  
  // Calculate logs per app
  const logsPerApp = TEST_CONFIG.applications.map(app => ({
    appId: app.id,
    count: Math.floor(TEST_CONFIG.totalLogs * app.weight)
  }));
  
  console.log('🚀 Starting parallel log generation...\n');
  
  // Run all apps in parallel
  const results = await Promise.all(
    logsPerApp.map((app, index) => 
      generateLogsForApp(app.appId, app.count, index * 100)
    )
  );
  
  const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  
  // Calculate totals
  const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  const overallLogsPerSecond = (totalSuccess / (Date.now() - overallStartTime) * 1000).toFixed(0);
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    Test Results                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('📈 Summary:');
  console.log(`   Total Duration: ${overallDuration}s`);
  console.log(`   Successful: ${totalSuccess.toLocaleString()} logs`);
  console.log(`   Failed: ${totalErrors.toLocaleString()} logs`);
  console.log(`   Overall Throughput: ${overallLogsPerSecond} logs/second`);
  console.log(`   Success Rate: ${(totalSuccess / (totalSuccess + totalErrors) * 100).toFixed(2)}%\n`);
  
  console.log('📊 Per Application:');
  results.forEach((result, index) => {
    const app = logsPerApp[index];
    console.log(`   ${app.appId}:`);
    console.log(`     - Logs: ${result.successCount.toLocaleString()}`);
    console.log(`     - Duration: ${result.duration}s`);
    console.log(`     - Throughput: ${result.logsPerSecond} logs/sec`);
  });
  
  console.log('\n✅ Performance test completed!\n');
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

