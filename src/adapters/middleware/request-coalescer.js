/**
 * Request Coalescer - Merges concurrent requests into batches
 * 
 * Benefits:
 * - Reduces database operations
 * - Better utilization of batch processing
 * - Improved throughput during traffic bursts
 * 
 * How it works:
 * 1. Incoming requests are held in a buffer for a short time window
 * 2. Multiple requests within the window are merged into a single batch
 * 3. Batch is processed once, results distributed to all waiting requests
 * 
 * Trade-off: Adds small latency (default 10ms) for better throughput
 */

class RequestCoalescer {
  constructor(processor, options = {}) {
    this.processor = processor; // Function to process batch
    
    // Configuration
    this.maxWaitTime = options.maxWaitTime || 10; // 10ms window
    this.maxBatchSize = options.maxBatchSize || 100; // Max requests per batch
    this.minBatchSize = options.minBatchSize || 2; // Minimum to trigger coalescing
    this.enabled = options.enabled !== false; // Default: enabled
    
    // State
    this.pending = [];
    this.timer = null;
    this.isFlushing = false;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalBatches: 0,
      totalCoalesced: 0,
      avgBatchSize: 0,
      maxBatchSeen: 0,
      bypassedRequests: 0
    };
    
    console.log('[RequestCoalescer] Initialized with config:', {
      maxWaitTime: this.maxWaitTime,
      maxBatchSize: this.maxBatchSize,
      enabled: this.enabled
    });
  }
  
  /**
   * Add a request to be coalesced
   * @param {any} data - Request data
   * @returns {Promise} Resolves with processing result
   */
  async add(data) {
    this.metrics.totalRequests++;
    
    // If disabled, process immediately
    if (!this.enabled) {
      this.metrics.bypassedRequests++;
      return this.processor([data]).then(results => results[0]);
    }
    
    return new Promise((resolve, reject) => {
      this.pending.push({ data, resolve, reject, timestamp: Date.now() });
      
      // Flush immediately if batch is full
      if (this.pending.length >= this.maxBatchSize) {
        this.flush();
      } 
      // Start timer for first request in batch
      else if (this.pending.length === 1 && !this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    });
  }
  
  /**
   * Flush pending requests and process as batch
   */
  async flush() {
    // Prevent concurrent flushes
    if (this.isFlushing || this.pending.length === 0) {
      return;
    }
    
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    this.isFlushing = true;
    
    // Take current batch and reset
    const batch = this.pending;
    this.pending = [];
    
    // Update metrics
    this.metrics.totalBatches++;
    const batchSize = batch.length;
    
    if (batchSize > 1) {
      this.metrics.totalCoalesced += batchSize;
    }
    
    if (batchSize > this.metrics.maxBatchSeen) {
      this.metrics.maxBatchSeen = batchSize;
    }
    
    // Calculate running average
    this.metrics.avgBatchSize = 
      (this.metrics.avgBatchSize * (this.metrics.totalBatches - 1) + batchSize) / 
      this.metrics.totalBatches;
    
    try {
      // Extract data from pending requests
      const dataArray = batch.map(req => req.data);
      
      // Process entire batch at once
      const results = await this.processor(dataArray);
      
      // Distribute results back to individual requests
      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(results[i]);
      }
    } catch (error) {
      console.error('[RequestCoalescer] Batch processing error:', error);
      
      // Reject all pending requests
      for (const req of batch) {
        req.reject(error);
      }
    } finally {
      this.isFlushing = false;
      
      // If new requests arrived during processing, start timer
      if (this.pending.length > 0 && !this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    }
  }
  
  /**
   * Force flush all pending requests (for shutdown)
   * @returns {Promise<void>}
   */
  async forceFlush() {
    if (this.pending.length > 0) {
      await this.flush();
    }
  }
  
  /**
   * Get coalescer statistics
   * @returns {Object} Metrics
   */
  getStats() {
    const coalescingRate = this.metrics.totalRequests > 0
      ? ((this.metrics.totalCoalesced / this.metrics.totalRequests) * 100).toFixed(2)
      : 0;
    
    return {
      enabled: this.enabled,
      totalRequests: this.metrics.totalRequests,
      totalBatches: this.metrics.totalBatches,
      totalCoalesced: this.metrics.totalCoalesced,
      coalescingRate: `${coalescingRate}%`,
      avgBatchSize: this.metrics.avgBatchSize.toFixed(2),
      maxBatchSeen: this.metrics.maxBatchSeen,
      bypassedRequests: this.metrics.bypassedRequests,
      currentPending: this.pending.length
    };
  }
  
  /**
   * Enable or disable coalescing
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[RequestCoalescer] ${enabled ? 'Enabled' : 'Disabled'}`);
    
    // If disabling, flush pending requests
    if (!enabled && this.pending.length > 0) {
      this.flush();
    }
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    if (config.maxWaitTime !== undefined) {
      this.maxWaitTime = config.maxWaitTime;
    }
    if (config.maxBatchSize !== undefined) {
      this.maxBatchSize = config.maxBatchSize;
    }
    if (config.minBatchSize !== undefined) {
      this.minBatchSize = config.minBatchSize;
    }
    
    console.log('[RequestCoalescer] Config updated:', {
      maxWaitTime: this.maxWaitTime,
      maxBatchSize: this.maxBatchSize,
      minBatchSize: this.minBatchSize
    });
  }
}

module.exports = RequestCoalescer;

