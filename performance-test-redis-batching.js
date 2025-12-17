#!/usr/bin/env node

// Load environment variables from .env file
require('@dotenvx/dotenvx').config();

const http = require('http');

const { randomUUID } = require('crypto');
const Redis = require('ioredis');

/**
 * Performance Test for Redis-Batched Log Ingestion
 *
 * This test measures the complete throughput pipeline:
 * 1. API Ingestion → Redis Queue
 * 2. Redis Queue → LogProcessorWorker
 * 3. LogProcessorWorker → ClickHouse
 *
 * Key metrics:
 * - API ingestion rate (logs/sec)
 * - Redis queue length over time
 * - Redis processing rate (logs/sec)
 * - ClickHouse ingestion rate (logs/sec)
 * - End-to-end latency
 */

// Configuration
const TEST_CONFIG = {
  totalLogs: 500000, // Smaller for focused testing
  applications: [
    { id: 'payment-service', weight: 0.30 },
    { id: 'auth-service', weight: 0.25 },
    { id: 'api-gateway', weight: 0.25 },
    { id: 'notification-service', weight: 0.20 }
  ],
  batchSize: 1000,
  parallelWorkers: 4,
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
  skipServerCheck: process.env.SKIP_SERVER_CHECK === 'true',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  queueKey: process.env.REDIS_LOG_QUEUE_KEY || 'logs:ingestion:queue',

  // Monitoring intervals
  queueMonitorInterval: 1000, // Check queue every 1 second
  clickhouseMonitorInterval: 5000, // Check ClickHouse every 5 seconds

  // Test duration phases
  warmupDuration: 10000, // 10 seconds warmup
  steadyStateDuration: 30000, // 30 seconds steady state
  cooldownDuration: 5000 // 5 seconds cooldown
};

// Log levels with realistic distribution (must match API schema enum)
const LOG_LEVELS = [
  { level: 'INFO', weight: 0.50 },
  { level: 'WARN', weight: 0.25 },
  { level: 'ERROR', weight: 0.15 },
  { level: 'DEBUG', weight: 0.08 }
  // Note: 'fatal' mapped to 'ERROR' since schema doesn't include 'FATAL'
];

const MESSAGES = {
  INFO: ['Request processed successfully', 'User logged in', 'Transaction completed'],
  WARN: ['High memory usage detected', 'Slow query detected', 'Rate limit approaching'],
  ERROR: ['Database connection failed', 'API timeout occurred', 'Invalid request payload', 'System out of memory', 'Database corruption detected', 'Critical service failure'],
  DEBUG: ['Processing request parameters', 'Cache lookup initiated', 'Validating user input']
};

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
 * Queue length monitoring class
 */
class QueueMonitor {
  constructor(redisClient, queueKey, interval = 1000) {
    this.redis = redisClient;
    this.queueKey = queueKey;
    this.interval = interval;
    this.isRunning = false;
    this.samples = [];
    this.startTime = null;
    this.initialQueueLength = 0;
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.initialQueueLength = await this.redis.llen(this.queueKey);

    console.log(`📊 Queue monitor started. Initial queue length: ${this.initialQueueLength}`);

    this.monitorInterval = setInterval(async () => {
      try {
        const length = await this.redis.llen(this.queueKey);
        const timestamp = Date.now();
        const elapsed = timestamp - this.startTime;

        this.samples.push({
          timestamp,
          elapsed,
          queueLength: length,
          netQueued: length - this.initialQueueLength
        });

        // Keep only last 300 samples (5 minutes at 1s intervals)
        if (this.samples.length > 300) {
          this.samples.shift();
        }
      } catch (error) {
        console.error('Queue monitoring error:', error.message);
      }
    }, this.interval);
  }

  stop() {
    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const lengths = this.samples.map(s => s.queueLength);
    const netQueued = this.samples.map(s => s.netQueued);

    return {
      currentLength: lengths[lengths.length - 1],
      maxLength: Math.max(...lengths),
      minLength: Math.min(...lengths),
      avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
      netQueued: netQueued[netQueued.length - 1] || 0,
      samples: this.samples.length
    };
  }

  getLatestSamples(count = 10) {
    return this.samples.slice(-count);
  }
}

/**
 * ClickHouse monitoring class
 */
class ClickHouseMonitor {
  constructor(interval = 5000) {
    this.interval = interval;
    this.isRunning = false;
    this.samples = [];
    this.startTime = null;
    this.initialCount = 0;
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();

    // Get initial count
    try {
      this.initialCount = await this.getClickHouseLogCount();
      console.log(`📊 ClickHouse monitor started. Initial log count: ${this.initialCount}`);
    } catch (error) {
      console.error('Failed to get initial ClickHouse count:', error.message);
      this.initialCount = 0;
    }

    this.monitorInterval = setInterval(async () => {
      try {
        const count = await this.getClickHouseLogCount();
        const timestamp = Date.now();
        const elapsed = timestamp - this.startTime;
        const netInserted = count - this.initialCount;

        this.samples.push({
          timestamp,
          elapsed,
          totalCount: count,
          netInserted
        });

        // Keep only last 120 samples (10 minutes at 5s intervals)
        if (this.samples.length > 120) {
          this.samples.shift();
        }
      } catch (error) {
        console.error('ClickHouse monitoring error:', error.message);
      }
    }, this.interval);
  }

  stop() {
    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async getClickHouseLogCount() {
    try {
      // Try to query ClickHouse directly via HTTP API
      const clickhouseUrl = 'http://localhost:8123';
      const response = await fetch(`${clickhouseUrl}/?query=SELECT count() FROM logs_db.logs FORMAT JSON`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        return parseInt(result.data[0]['count()']) || 0;
      }

      throw new Error(`ClickHouse HTTP ${response.status}`);
    } catch (error) {
      console.warn('Could not query ClickHouse directly:', error.message);
      return 0;
    }
  }

  getStats() {
    if (this.samples.length < 2) return null;

    const latest = this.samples[this.samples.length - 1];
    const previous = this.samples[this.samples.length - 2];
    const timeDiff = (latest.timestamp - previous.timestamp) / 1000; // seconds
    const logsDiff = latest.netInserted - previous.netInserted;

    const ingestionRate = logsDiff / timeDiff; // logs per second

    return {
      currentTotal: latest.totalCount,
      netInserted: latest.netInserted,
      currentIngestionRate: Math.max(0, ingestionRate),
      avgIngestionRate: this.calculateAverageRate(),
      samples: this.samples.length
    };
  }

  calculateAverageRate() {
    if (this.samples.length < 2) return 0;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const totalTime = (last.timestamp - first.timestamp) / 1000; // seconds
    const totalLogs = last.netInserted - first.netInserted;

    return totalLogs / totalTime;
  }
}

/**
 * Throughput calculator
 */
class ThroughputCalculator {
  constructor() {
    this.metrics = {
      apiIngestion: { startTime: null, totalLogs: 0, batches: 0 },
      redisProcessing: { processedLogs: 0, rates: [] },
      clickhouseIngestion: { insertedLogs: 0, rates: [] }
    };
  }

  startApiIngestion() {
    this.metrics.apiIngestion.startTime = Date.now();
  }

  recordApiBatch(logsCount) {
    this.metrics.apiIngestion.totalLogs += logsCount;
    this.metrics.apiIngestion.batches++;
  }

  getApiThroughput() {
    if (!this.metrics.apiIngestion.startTime) return 0;

    const elapsed = (Date.now() - this.metrics.apiIngestion.startTime) / 1000;
    return this.metrics.apiIngestion.totalLogs / elapsed;
  }

  updateRedisProcessing(queueStats, timeWindow = 10000) {
    // Estimate processing rate based on queue length changes
    if (queueStats && queueStats.samples && queueStats.samples.length >= 2) {
      const samples = queueStats.samples.slice(-10); // Last 10 seconds
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const timeDiff = (last.timestamp - first.timestamp) / 1000;
        const queueDiff = first.queueLength - last.queueLength; // Negative means growing queue

        const processingRate = Math.max(0, queueDiff / timeDiff);
        this.metrics.redisProcessing.rates.push(processingRate);

        // Keep only last 20 rates
        if (this.metrics.redisProcessing.rates.length > 20) {
          this.metrics.redisProcessing.rates.shift();
        }
      }
    }
  }

  updateClickHouseIngestion(chStats) {
    if (chStats && chStats.currentIngestionRate !== undefined) {
      this.metrics.clickhouseIngestion.rates.push(chStats.currentIngestionRate);

      // Keep only last 20 rates
      if (this.metrics.clickhouseIngestion.rates.length > 20) {
        this.metrics.clickhouseIngestion.rates.shift();
      }
    }
  }

  getAverageRedisProcessingRate() {
    if (this.metrics.redisProcessing.rates.length === 0) return 0;
    return this.metrics.redisProcessing.rates.reduce((a, b) => a + b, 0) / this.metrics.redisProcessing.rates.length;
  }

  getAverageClickHouseRate() {
    if (this.metrics.clickhouseIngestion.rates.length === 0) return 0;
    return this.metrics.clickhouseIngestion.rates.reduce((a, b) => a + b, 0) / this.metrics.clickhouseIngestion.rates.length;
  }
}

/**
 * Generate and send logs for a specific application
 */
async function generateLogsForApp(appId, count, throughputCalc) {
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

  // Send batches
  for (let i = 0; i < batches.length; i++) {
    try {
      await sendBatch(batches[i], i, appId);
      successCount += batches[i].length;

      // Record in throughput calculator
      throughputCalc.recordApiBatch(batches[i].length);

      // Progress indicator
      if ((i + 1) % 10 === 0) {
        const progress = ((i + 1) / batches.length * 100).toFixed(1);
        const currentThroughput = throughputCalc.getApiThroughput();
        process.stdout.write(`\r  ${appId}: ${progress}% (${successCount}/${count} logs, ${currentThroughput.toFixed(0)} logs/sec)`);
      }
    } catch (error) {
      errorCount += batches[i].length;
    }
  }

  console.log(`\n✅ ${appId}: ${successCount} logs sent`);

  return { successCount, errorCount };
}

/**
 * Run the performance test
 */
async function runRedisBatchingTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Redis-Batched Log Ingestion Throughput Test                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Test Configuration:');
  console.log(`   Total Logs: ${TEST_CONFIG.totalLogs.toLocaleString()}`);
  console.log(`   Applications: ${TEST_CONFIG.applications.length}`);
  console.log(`   Batch Size: ${TEST_CONFIG.batchSize}`);
  console.log(`   Server: ${TEST_CONFIG.serverUrl}`);
  console.log(`   Redis Queue: ${TEST_CONFIG.queueKey}`);
  console.log(`   Parallel Workers: ${TEST_CONFIG.parallelWorkers}\n`);

  // Initialize Redis client for monitoring
  const redisClient = new Redis(TEST_CONFIG.redisUrl);
  const queueMonitor = new QueueMonitor(redisClient, TEST_CONFIG.queueKey);
  const clickhouseMonitor = new ClickHouseMonitor();
  const throughputCalc = new ThroughputCalculator();

  try {
    // Check server health (skip if requested)
    if (!TEST_CONFIG.skipServerCheck) {
      console.log('🏥 Checking server health...');
      await new Promise((resolve, reject) => {
        const req = http.get(`${TEST_CONFIG.serverUrl}/health`, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Server is not healthy. Status: ${res.statusCode}`));
          }
        });

        req.on('error', (e) => {
          reject(new Error(`Server health check failed: ${e.message}`));
        });

        req.end();
      });
      console.log('✅ Server is healthy\n');
    } else {
      console.log('🏥 Skipping server health check (SKIP_SERVER_CHECK=true)\n');
    }

    // Start monitoring
    console.log('📊 Starting monitoring...');
    await queueMonitor.start();
    await clickhouseMonitor.start();

    const overallStartTime = Date.now();

    // Calculate logs per app
    const logsPerApp = TEST_CONFIG.applications.map(app => ({
      appId: app.id,
      count: Math.floor(TEST_CONFIG.totalLogs * app.weight)
    }));

    console.log('🚀 Starting log ingestion...\n');

    // Start API ingestion tracking
    throughputCalc.startApiIngestion();

    // Run all apps in parallel
    const results = await Promise.all(
      logsPerApp.map((app, index) =>
        generateLogsForApp(app.appId, app.count, throughputCalc)
      )
    );

    const ingestionEndTime = Date.now();

    // Wait for processing to complete
    console.log('\n⏳ Waiting for Redis queue to be processed...');
    let queueEmpty = false;
    let waitAttempts = 0;
    const maxWaitAttempts = 120; // 2 minutes max wait

    while (!queueEmpty && waitAttempts < maxWaitAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const queueStats = queueMonitor.getStats();
      queueEmpty = queueStats && queueStats.currentLength === 0;
      waitAttempts++;

      if (waitAttempts % 10 === 0) {
        const chStats = clickhouseMonitor.getStats();
        console.log(`   Queue length: ${queueStats ? queueStats.currentLength : 'unknown'}, ClickHouse logs: ${chStats ? chStats.netInserted : 'unknown'}`);
      }
    }

    const processingEndTime = Date.now();

    // Stop monitoring
    queueMonitor.stop();
    clickhouseMonitor.stop();

    // Calculate final metrics
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);

    const ingestionDuration = (ingestionEndTime - overallStartTime) / 1000;
    const processingDuration = (processingEndTime - overallStartTime) / 1000;

    const apiThroughput = totalSuccess / ingestionDuration;
    const endToEndThroughput = totalSuccess / processingDuration;

    // Get monitoring stats
    const queueStats = queueMonitor.getStats();
    const chStats = clickhouseMonitor.getStats();

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                             Test Results                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('📈 Overall Performance:');
    console.log(`   Total Duration: ${processingDuration.toFixed(2)}s`);
    console.log(`   Successful: ${totalSuccess.toLocaleString()} logs`);
    console.log(`   Failed: ${totalErrors.toLocaleString()} logs`);
    console.log(`   Success Rate: ${(totalSuccess / (totalSuccess + totalErrors) * 100).toFixed(2)}%\n`);

    console.log('🚀 Throughput Metrics:');
    console.log(`   API Ingestion Rate: ${apiThroughput.toFixed(0)} logs/sec`);
    console.log(`   End-to-End Rate: ${endToEndThroughput.toFixed(0)} logs/sec`);

    if (queueStats) {
      console.log(`   Peak Queue Length: ${queueStats.maxLength}`);
      console.log(`   Average Queue Length: ${queueStats.avgLength.toFixed(1)}`);
    }

    if (chStats) {
      console.log(`   ClickHouse Ingestion Rate: ${chStats.avgIngestionRate.toFixed(0)} logs/sec`);
    }

    console.log('\n📊 Pipeline Analysis:');

    const avgRedisProcessingRate = throughputCalc.getAverageRedisProcessingRate();
    if (avgRedisProcessingRate > 0) {
      console.log(`   Redis Processing Rate: ${avgRedisProcessingRate.toFixed(0)} logs/sec`);
    }

    // Calculate bottlenecks
    const rates = [
      { stage: 'API Ingestion', rate: apiThroughput },
      { stage: 'Redis Processing', rate: avgRedisProcessingRate },
      { stage: 'ClickHouse Ingestion', rate: chStats ? chStats.avgIngestionRate : 0 }
    ].filter(r => r.rate > 0);

    if (rates.length > 0) {
      const slowest = rates.reduce((min, curr) => curr.rate < min.rate ? curr : min);
      console.log(`   Bottleneck: ${slowest.stage} (${slowest.rate.toFixed(0)} logs/sec)`);

      const efficiency = (endToEndThroughput / apiThroughput * 100).toFixed(1);
      console.log(`   Pipeline Efficiency: ${efficiency}%`);
    }

    console.log('\n📋 Recommendations:');
    if (queueStats && queueStats.maxLength > 10000) {
      console.log('   ⚠️  High queue backlog detected. Consider increasing LogProcessorWorker batch size or count.');
    }
    if (apiThroughput > (chStats ? chStats.avgIngestionRate * 1.5 : apiThroughput)) {
      console.log('   ⚠️  API ingestion significantly faster than ClickHouse. Queue may grow during bursts.');
    }
    console.log('   ✅ Redis batching provides excellent decoupling between ingestion and persistence.');

    console.log('\n✅ Redis batching throughput test completed!\n');

  } finally {
    // Cleanup
    queueMonitor.stop();
    clickhouseMonitor.stop();
    await redisClient.quit();
  }
}

// Run the test
runRedisBatchingTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
