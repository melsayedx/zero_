// benchmark.js
const { performance } = require('perf_hooks');
const LogEntry = require('./src/core/entities/log-entry');

async function benchmark(name, fn) {
  global.gc && global.gc(); // Force GC before test
  const start = performance.now();
  
  await fn();
  
  const end = performance.now();
  console.log(`${name}: ${(end - start).toFixed(2)}ms`);
}

async function test() {
  const testLogs = Array(300000).fill(null).map((_, i) => ({
    app_id: 'test',
    level: 'INFO',
    message: `Log ${i}`,
    metadata: { index: i },
    source: 'test'
  }));
  
  await benchmark('createBatch', async () => {
    return LogEntry.createBatch(testLogs, { batchSize: 500 });
  });
  
  await benchmark('createBatch', async () => {
    return await LogEntry.createBatch(testLogs);
  });
}

test();
