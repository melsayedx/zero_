/**
 * Optimized Ingest Service
 * 
 * Wraps the IngestLogUseCase with performance optimizations:
 * - Request coalescing for burst traffic
 * - Object pooling for reduced GC pressure
 * - Efficient batch processing
 */

const RequestCoalescer = require('../../adapters/middleware/request-coalescer');
const { createLogEntryPool, batchPopulateLogEntries } = require('../entities/log-entry-pool');
const IngestResult = require('../use-cases/ingest-result');

class OptimizedIngestService {
  constructor(ingestUseCase, options = {}) {
    this.ingestUseCase = ingestUseCase;
    
    // Object pool for log entries
    this.logEntryPool = createLogEntryPool({
      initialSize: options.poolInitialSize || 1000,
      maxSize: options.poolMaxSize || 10000
    });
    
    // Request coalescer for batching concurrent requests
    this.coalescer = new RequestCoalescer(
      (dataArray) => this.processBatch(dataArray),
      {
        maxWaitTime: options.coalescerMaxWaitTime || 10, // 10ms
        maxBatchSize: options.coalescerMaxBatchSize || 100,
        enabled: options.coalescingEnabled !== false
      }
    );
    
    // Configuration
    this.usePooling = options.usePooling !== false;
    this.useCoalescing = options.useCoalescing !== false;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalLogs: 0,
      pooledRequests: 0,
      coalescedRequests: 0
    };
    
    console.log('[OptimizedIngestService] Initialized with config:', {
      usePooling: this.usePooling,
      useCoalescing: this.useCoalescing,
      poolSize: this.logEntryPool.getStats().available,
      coalescerEnabled: this.coalescer.enabled
    });
  }
  
  /**
   * Ingest a single log or batch of logs
   * @param {Object|Array<Object>} data - Single log or array of logs
   * @returns {Promise<IngestResult>} Ingest result
   */
  async ingest(data) {
    this.metrics.totalRequests++;
    
    // Handle single log
    if (!Array.isArray(data)) {
      data = [data];
    }
    
    this.metrics.totalLogs += data.length;
    
    // If coalescing is enabled, add to coalescer
    if (this.useCoalescing && data.length < 50) {
      // Only coalesce smaller requests; large batches go direct
      this.metrics.coalescedRequests++;
      return this.coalescer.add(data);
    }
    
    // Process directly (no coalescing for large batches)
    const results = await this.processBatch([data]);
    return results[0];
  }
  
  /**
   * Process a batch of requests
   * @private
   * @param {Array<Array<Object>>} requestBatch - Array of request data arrays
   * @returns {Promise<Array<IngestResult>>} Array of results
   */
  async processBatch(requestBatch) {
    const results = [];
    
    // Flatten all requests into a single large batch
    const allLogs = requestBatch.flat();
    
    try {
      // Use object pool if enabled
      let logEntries;
      if (this.usePooling) {
        this.metrics.pooledRequests++;
        logEntries = batchPopulateLogEntries(this.logEntryPool, allLogs);
      } else {
        // Fallback to regular creation
        const LogEntry = require('../entities/log-entry');
        logEntries = allLogs.map(data => new LogEntry(data));
      }
      
      // Process through use case
      const result = await this.ingestUseCase.execute(logEntries);
      
      // Distribute results back to individual requests
      let offset = 0;
      for (let i = 0; i < requestBatch.length; i++) {
        const reqData = requestBatch[i];
        const count = Array.isArray(reqData) ? reqData.length : 1;
        results.push(new IngestResult(true, count));
        offset += count;
      }
      
      return results;
    } catch (error) {
      // All requests in batch failed
      for (let i = 0; i < requestBatch.length; i++) {
        const reqData = requestBatch[i];
        results.push(new IngestResult(false, 0, error.message));
      }
      return results;
    }
  }
  
  /**
   * Force flush any pending coalesced requests
   * Useful during graceful shutdown
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.useCoalescing) {
      await this.coalescer.forceFlush();
    }
  }
  
  /**
   * Get service statistics
   * @returns {Object} Service metrics
   */
  getStats() {
    const stats = {
      service: {
        totalRequests: this.metrics.totalRequests,
        totalLogs: this.metrics.totalLogs,
        pooledRequests: this.metrics.pooledRequests,
        coalescedRequests: this.metrics.coalescedRequests,
        avgLogsPerRequest: this.metrics.totalRequests > 0
          ? (this.metrics.totalLogs / this.metrics.totalRequests).toFixed(2)
          : 0
      }
    };
    
    if (this.usePooling) {
      stats.objectPool = this.logEntryPool.getStats();
    }
    
    if (this.useCoalescing) {
      stats.coalescer = this.coalescer.getStats();
    }
    
    return stats;
  }
  
  /**
   * Update configuration at runtime
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    if (config.useCoalescing !== undefined) {
      this.useCoalescing = config.useCoalescing;
      this.coalescer.setEnabled(config.useCoalescing);
    }
    
    if (config.coalescerMaxWaitTime || config.coalescerMaxBatchSize) {
      this.coalescer.updateConfig({
        maxWaitTime: config.coalescerMaxWaitTime,
        maxBatchSize: config.coalescerMaxBatchSize
      });
    }
    
    console.log('[OptimizedIngestService] Config updated:', config);
  }
}

module.exports = OptimizedIngestService;

