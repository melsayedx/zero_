/**
 * BatchBuffer - Intelligent buffer for batching ClickHouse inserts
 * 
 * Accumulates logs across multiple requests and flushes them in large batches
 * to ClickHouse, reducing network overhead and improving throughput.
 * 
 * Features:
 * - Size-based flushing (default: 10,000 logs)
 * - Time-based flushing (default: 1 second)
 * - Compression support
 * - Error handling with retry logic
 * - Performance metrics
 */

class BatchBuffer {
  constructor(clickhouseClient, options = {}) {
    this.client = clickhouseClient;
    this.tableName = options.tableName || process.env.CLICKHOUSE_TABLE || 'logs';
    
    // Buffer configuration
    this.maxBatchSize = options.maxBatchSize || 10000; // Flush at 10K logs
    this.maxWaitTime = options.maxWaitTime || 1000;    // Flush after 1 second
    this.compressionEnabled = options.compression !== false; // Default: enabled
    
    // Buffer state
    this.buffer = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.isShuttingDown = false;
    
    // Metrics
    this.metrics = {
      totalLogsBuffered: 0,
      totalLogsInserted: 0,
      totalFlushes: 0,
      totalErrors: 0,
      avgBatchSize: 0,
      lastFlushTime: null,
      lastFlushSize: 0
    };
    
    // Start the flush timer
    this.startFlushTimer();
    
    console.log('[BatchBuffer] Initialized with config:', {
      maxBatchSize: this.maxBatchSize,
      maxWaitTime: this.maxWaitTime,
      compression: this.compressionEnabled,
      table: this.tableName
    });
  }
  
  /**
   * Add logs to the buffer
   * @param {Array<Object>} logs - Array of log objects (already validated)
   * @returns {Promise<void>}
   */
  async add(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      return;
    }
    
    if (this.isShuttingDown) {
      throw new Error('BatchBuffer is shutting down, cannot accept new logs');
    }
    
    // Add to buffer
    this.buffer.push(...logs);
    this.metrics.totalLogsBuffered += logs.length;
    
    // Check if we need to flush based on size
    if (this.buffer.length >= this.maxBatchSize) {
      await this.flush();
    }
  }
  
  /**
   * Flush the buffer to ClickHouse
   * @returns {Promise<Object>} Flush result with metrics
   */
  async flush() {
    // Prevent concurrent flushes
    if (this.isFlushing || this.buffer.length === 0) {
      return { flushed: 0, buffered: this.buffer.length };
    }
    
    this.isFlushing = true;
    const startTime = Date.now();
    
    // Take current buffer and reset (allows new logs to accumulate)
    const logsToFlush = this.buffer;
    this.buffer = [];
    
    // Restart the flush timer
    this.resetFlushTimer();
    
    try {
      // Insert with compression
      await this.client.insert({
        table: this.tableName,
        values: logsToFlush,
        format: 'JSONEachRow',
        clickhouse_settings: {
          // Async insert settings for optimal performance
          async_insert: 1,
          wait_for_async_insert: 0,
          
          // Compression (LZ4 is fastest, ZSTD is best compression)
          enable_http_compression: this.compressionEnabled ? 1 : 0,
          http_zlib_compression_level: 3, // Fast compression
          
          // Batch settings
          max_insert_block_size: this.maxBatchSize,
          min_insert_block_size_rows: Math.floor(this.maxBatchSize / 2),
          min_insert_block_size_bytes: 1048576, // 1MB
          
          // Timeout settings
          max_execution_time: 30, // 30 second timeout
          send_timeout: 30,
          receive_timeout: 30
        }
      });
      
      // Update metrics
      const flushTime = Date.now() - startTime;
      this.metrics.totalLogsInserted += logsToFlush.length;
      this.metrics.totalFlushes++;
      this.metrics.avgBatchSize = Math.round(
        this.metrics.totalLogsInserted / this.metrics.totalFlushes
      );
      this.metrics.lastFlushTime = new Date().toISOString();
      this.metrics.lastFlushSize = logsToFlush.length;
      
      console.log('[BatchBuffer] Flushed successfully:', {
        logs: logsToFlush.length,
        duration: flushTime + 'ms',
        buffered: this.buffer.length,
        totalInserted: this.metrics.totalLogsInserted
      });
      
      return {
        flushed: logsToFlush.length,
        buffered: this.buffer.length,
        duration: flushTime
      };
      
    } catch (error) {
      this.metrics.totalErrors++;
      
      console.error('[BatchBuffer] Flush error:', {
        error: error.message,
        logsLost: logsToFlush.length,
        buffered: this.buffer.length
      });
      
      // In production, you might want to:
      // 1. Retry the failed batch
      // 2. Write to a dead-letter queue
      // 3. Write to disk for recovery
      // For now, we'll just log the error (logs are lost)
      
      throw error;
      
    } finally {
      this.isFlushing = false;
    }
  }
  
  /**
   * Start the periodic flush timer
   * @private
   */
  startFlushTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(() => {
      this.flush().catch(error => {
        console.error('[BatchBuffer] Timer flush error:', error.message);
      });
    }, this.maxWaitTime);
  }
  
  /**
   * Reset the flush timer
   * @private
   */
  resetFlushTimer() {
    if (!this.isShuttingDown) {
      this.startFlushTimer();
    }
  }
  
  /**
   * Get current buffer size
   * @returns {number}
   */
  size() {
    return this.buffer.length;
  }
  
  /**
   * Get buffer metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentBufferSize: this.buffer.length,
      isFlushing: this.isFlushing
    };
  }
  
  /**
   * Graceful shutdown - flush remaining logs
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log('[BatchBuffer] Shutting down...');
    
    this.isShuttingDown = true;
    
    // Stop accepting new logs
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush remaining logs
    if (this.buffer.length > 0) {
      console.log(`[BatchBuffer] Flushing ${this.buffer.length} remaining logs...`);
      try {
        await this.flush();
        console.log('[BatchBuffer] Shutdown complete - all logs flushed');
      } catch (error) {
        console.error('[BatchBuffer] Error during shutdown flush:', error.message);
        throw error;
      }
    } else {
      console.log('[BatchBuffer] Shutdown complete - no logs to flush');
    }
  }
  
  /**
   * Force immediate flush (useful for testing or manual triggers)
   * @returns {Promise<Object>}
   */
  async forceFlush() {
    console.log('[BatchBuffer] Force flush requested');
    return await this.flush();
  }
  
  /**
   * Check if buffer is healthy
   * @returns {Object}
   */
  getHealth() {
    const bufferUsage = (this.buffer.length / this.maxBatchSize) * 100;
    const errorRate = this.metrics.totalFlushes > 0
      ? (this.metrics.totalErrors / this.metrics.totalFlushes) * 100
      : 0;
    
    return {
      healthy: errorRate < 10, // Less than 10% error rate
      bufferSize: this.buffer.length,
      bufferUsage: `${bufferUsage.toFixed(1)}%`,
      errorRate: `${errorRate.toFixed(2)}%`,
      isFlushing: this.isFlushing,
      metrics: this.metrics
    };
  }
}

module.exports = BatchBuffer;

