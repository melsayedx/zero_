#!/usr/bin/env node

/**
 * Parallel Performance Test Runner
 * Runs multiple performance test workers in parallel to simulate extreme load
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration
const PARALLEL_WORKERS = 4;
const TEST_SCRIPT = path.join(__dirname, 'performance-test.js');

// Track worker results
const workerResults = [];
const startTime = Date.now();

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     Parallel Log Ingestion Performance Test               ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('🚀 Test Configuration:');
console.log(`   Parallel Workers: ${PARALLEL_WORKERS}`);
console.log(`   Logs per Worker: 2,000,000`);
console.log(`   Total Logs: ${(PARALLEL_WORKERS * 2000000).toLocaleString()}`);
console.log(`   Test Script: ${TEST_SCRIPT}\n`);

console.log('⚠️  WARNING: This will generate MASSIVE load on your system!');
console.log('   Make sure you have sufficient resources.\n');

// Wait for user confirmation (with timeout)
console.log('Starting in 3 seconds... (Ctrl+C to cancel)\n');

setTimeout(() => {
  startParallelTests();
}, 3000);

/**
 * Start all parallel workers
 */
function startParallelTests() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║               Starting Parallel Workers                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workers = [];

  // Spawn all workers
  for (let i = 0; i < PARALLEL_WORKERS; i++) {
    const workerId = i + 1;
    console.log(`🔄 Starting Worker ${workerId}...`);
    
    const worker = spawnWorker(workerId);
    workers.push(worker);
  }

  console.log(`\n✅ All ${PARALLEL_WORKERS} workers started!\n`);
  console.log('═'.repeat(63));
  console.log('                   WORKER OUTPUT');
  console.log('═'.repeat(63) + '\n');

  // Wait for all workers to complete
  Promise.all(workers).then(handleAllWorkersComplete).catch(handleError);
}

/**
 * Spawn a single worker process
 */
function spawnWorker(workerId) {
  return new Promise((resolve, reject) => {
    const workerStartTime = Date.now();
    
    // Spawn the child process
    const worker = spawn('node', [TEST_SCRIPT], {
      env: {
        ...process.env,
        WORKER_ID: workerId,
        SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000'
      },
      stdio: 'pipe'
    });

    let outputBuffer = '';
    let errorBuffer = '';
    let lastOutput = '';

    // Capture stdout
    worker.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      
      // Print worker output with prefix
      const lines = output.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`[Worker ${workerId}] ${line}`);
          lastOutput = line;
        }
      });
    });

    // Capture stderr
    worker.stderr.on('data', (data) => {
      const error = data.toString();
      errorBuffer += error;
      console.error(`[Worker ${workerId}] ❌ ${error}`);
    });

    // Handle worker completion
    worker.on('close', (code) => {
      const duration = ((Date.now() - workerStartTime) / 1000).toFixed(2);
      
      if (code === 0) {
        console.log(`\n✅ [Worker ${workerId}] Completed successfully in ${duration}s\n`);
        
        // Try to extract throughput from output
        const throughputMatch = outputBuffer.match(/Overall Throughput: ([\d,]+) logs\/second/);
        const successMatch = outputBuffer.match(/Successful: ([\d,]+) logs/);
        
        workerResults.push({
          workerId,
          success: true,
          duration: parseFloat(duration),
          throughput: throughputMatch ? parseInt(throughputMatch[1].replace(/,/g, '')) : 0,
          logsProcessed: successMatch ? parseInt(successMatch[1].replace(/,/g, '')) : 0,
          code
        });
        
        resolve({
          workerId,
          success: true,
          duration: parseFloat(duration)
        });
      } else {
        console.error(`\n❌ [Worker ${workerId}] Failed with exit code ${code} after ${duration}s\n`);
        
        workerResults.push({
          workerId,
          success: false,
          duration: parseFloat(duration),
          code,
          error: errorBuffer || 'Unknown error'
        });
        
        resolve({
          workerId,
          success: false,
          duration: parseFloat(duration),
          error: errorBuffer
        });
      }
    });

    // Handle worker errors
    worker.on('error', (error) => {
      console.error(`\n❌ [Worker ${workerId}] Process error:`, error.message, '\n');
      reject(error);
    });
  });
}

/**
 * Handle completion of all workers
 */
function handleAllWorkersComplete() {
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║              All Workers Completed!                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Calculate aggregate statistics
  const successfulWorkers = workerResults.filter(r => r.success);
  const failedWorkers = workerResults.filter(r => !r.success);
  
  const totalLogsProcessed = successfulWorkers.reduce((sum, r) => sum + (r.logsProcessed || 0), 0);
  const avgThroughputPerWorker = successfulWorkers.reduce((sum, r) => sum + (r.throughput || 0), 0) / successfulWorkers.length;
  const totalThroughput = (totalLogsProcessed / (Date.now() - startTime) * 1000).toFixed(0);
  const avgDuration = successfulWorkers.reduce((sum, r) => sum + r.duration, 0) / successfulWorkers.length;

  console.log('📊 Aggregate Results:');
  console.log('═'.repeat(63));
  console.log(`   Total Duration: ${totalDuration}s`);
  console.log(`   Successful Workers: ${successfulWorkers.length}/${PARALLEL_WORKERS}`);
  console.log(`   Failed Workers: ${failedWorkers.length}`);
  console.log(`   Total Logs Processed: ${totalLogsProcessed.toLocaleString()}`);
  console.log(`   Aggregate Throughput: ${totalThroughput} logs/second`);
  console.log(`   Average Duration per Worker: ${avgDuration.toFixed(2)}s`);
  console.log(`   Average Throughput per Worker: ${avgThroughputPerWorker.toFixed(0)} logs/sec\n`);

  console.log('📈 Individual Worker Performance:');
  console.log('═'.repeat(63));
  workerResults.forEach(result => {
    if (result.success) {
      console.log(`   Worker ${result.workerId}:`);
      console.log(`     ✅ Success`);
      console.log(`     ⏱️  Duration: ${result.duration}s`);
      console.log(`     📊 Logs: ${result.logsProcessed.toLocaleString()}`);
      console.log(`     🚀 Throughput: ${result.throughput.toLocaleString()} logs/sec`);
    } else {
      console.log(`   Worker ${result.workerId}:`);
      console.log(`     ❌ Failed (exit code: ${result.code})`);
      console.log(`     ⏱️  Duration: ${result.duration}s`);
      if (result.error) {
        console.log(`     📝 Error: ${result.error.substring(0, 100)}...`);
      }
    }
    console.log('');
  });

  // Performance assessment
  console.log('🎯 Performance Assessment:');
  console.log('═'.repeat(63));
  
  const throughputNum = parseInt(totalThroughput);
  if (throughputNum > 50000) {
    console.log('   🏆 EXCELLENT! Your system handled extreme load remarkably well!');
  } else if (throughputNum > 30000) {
    console.log('   ✅ GREAT! Very good performance under heavy load.');
  } else if (throughputNum > 15000) {
    console.log('   👍 GOOD! Acceptable performance for most use cases.');
  } else if (throughputNum > 5000) {
    console.log('   ⚠️  MODERATE: Consider optimizing for higher loads.');
  } else {
    console.log('   ❌ LOW: System may be bottlenecked. Check resources.');
  }

  if (failedWorkers.length > 0) {
    console.log(`   ⚠️  ${failedWorkers.length} worker(s) failed - investigate errors above.`);
  }

  console.log('\n💡 Next Steps:');
  console.log('   - Query results: docker exec -it log-platform-clickhouse clickhouse-client');
  console.log('   - Check ClickHouse: SELECT app_id, count() FROM logs_db.logs GROUP BY app_id;');
  console.log('   - Monitor resources: docker stats log-platform-clickhouse');
  console.log('   - Check logs: docker logs log-platform-clickhouse');

  console.log('\n✅ Parallel performance test completed!\n');
  
  // Exit with appropriate code
  process.exit(failedWorkers.length > 0 ? 1 : 0);
}

/**
 * Handle errors
 */
function handleError(error) {
  console.error('\n❌ Parallel test failed:', error);
  console.error('\nPartial results from completed workers:');
  workerResults.forEach(result => {
    console.log(`   Worker ${result.workerId}: ${result.success ? '✅' : '❌'} - Duration: ${result.duration}s`);
  });
  process.exit(1);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT - stopping all workers...\n');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Received SIGTERM - stopping all workers...\n');
  process.exit(143);
});

