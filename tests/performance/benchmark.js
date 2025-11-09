/**
 * Performance Benchmark Tests
 * Tests ingestion throughput and query performance
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.TEST_API_KEY || 'test-api-key';

/**
 * Generate sample log
 */
function generateLog(index) {
  return {
    timestamp: new Date().toISOString(),
    level: ['DEBUG', 'INFO', 'WARN', 'ERROR'][Math.floor(Math.random() * 4)],
    message: `Benchmark log message ${index}`,
    service: `service-${Math.floor(Math.random() * 10)}`,
    metadata: {
      requestId: `req-${index}`,
      userId: `user-${Math.floor(Math.random() * 1000)}`
    }
  };
}

/**
 * Benchmark batch ingestion
 */
async function benchmarkBatchIngestion(batchSize, iterations) {
  console.log(`\n=== Batch Ingestion Benchmark ===`);
  console.log(`Batch Size: ${batchSize}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Total Logs: ${batchSize * iterations}`);

  const results = [];
  let totalLogs = 0;
  let totalTime = 0;

  for (let i = 0; i < iterations; i++) {
    const logs = Array.from({ length: batchSize }, (_, j) => 
      generateLog(i * batchSize + j)
    );

    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `${API_URL}/api/v1/ingest/batch`,
        { logs },
        {
          headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const duration = Date.now() - startTime;
      results.push(duration);
      totalLogs += batchSize;
      totalTime += duration;

      console.log(`Batch ${i + 1}/${iterations}: ${duration}ms (${Math.round(batchSize / duration * 1000)} logs/sec)`);
    } catch (error) {
      console.error(`Batch ${i + 1} failed:`, error.message);
    }
  }

  const avgDuration = totalTime / iterations;
  const throughput = Math.round(totalLogs / totalTime * 1000);

  console.log(`\nResults:`);
  console.log(`  Total Logs: ${totalLogs}`);
  console.log(`  Total Time: ${totalTime}ms`);
  console.log(`  Avg Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`  Throughput: ${throughput} logs/sec`);
}

/**
 * Benchmark query performance
 */
async function benchmarkQuery() {
  console.log(`\n=== Query Benchmark ===`);

  const queries = [
    {
      name: 'Recent logs',
      query: {
        timeRange: {
          start: new Date(Date.now() - 3600000).toISOString(),
          end: new Date().toISOString()
        },
        limit: 100
      }
    },
    {
      name: 'Filtered by service',
      query: {
        timeRange: {
          start: new Date(Date.now() - 3600000).toISOString(),
          end: new Date().toISOString()
        },
        service: 'service-1',
        limit: 100
      }
    },
    {
      name: 'Filtered by level',
      query: {
        timeRange: {
          start: new Date(Date.now() - 3600000).toISOString(),
          end: new Date().toISOString()
        },
        level: 'ERROR',
        limit: 100
      }
    }
  ];

  for (const { name, query } of queries) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `${API_URL}/api/v1/query/logs`,
        query,
        {
          headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const duration = Date.now() - startTime;
      const count = response.data.count || 0;

      console.log(`${name}: ${duration}ms (${count} logs)`);
    } catch (error) {
      console.error(`${name} failed:`, error.message);
    }
  }
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  console.log(`Performance Benchmark`);
  console.log(`API URL: ${API_URL}`);
  console.log(`========================================`);

  try {
    // Check API health
    const health = await axios.get(`${API_URL}/health`);
    console.log(`API Health: ${health.data.status}`);

    // Run benchmarks
    await benchmarkBatchIngestion(1000, 10);
    await benchmarkQuery();

    console.log(`\n✅ Benchmarks completed`);
  } catch (error) {
    console.error(`\n❌ Benchmark failed:`, error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runBenchmarks()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { benchmarkBatchIngestion, benchmarkQuery };

