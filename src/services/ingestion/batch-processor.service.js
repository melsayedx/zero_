/**
 * Batch Processor Service
 * High-performance batch processing for log ingestion
 * Implements buffering and automatic flushing for optimal throughput
 */

const clickhouseService = require('../storage/clickhouse.service');
const logger = require('../../utils/logger');
const performanceMonitor = require('../../utils/performance-monitor');

class BatchProcessorService {
  constructor() {
    this.buffer = [];
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 10000;
    this.batchTimeout = parseInt(process.env.BATCH_TIMEOUT) || 1000;
    this.maxConcurrentBatches = parseInt(process.env.MAX_CONCURRENT_BATCHES) || 5;
    this.currentBatches = 0;
    this.flushTimer = null;
    this.totalProcessed = 0;
    this.totalBatches = 0;
    this.isProcessing = false;
  }

  /**
   * Initialize batch processor
   */
  init() {
    this.startAutoFlush();
    logger.info('Batch processor initialized', {
      batchSize: this.batchSize,
      batchTimeout: this.batchTimeout,
      maxConcurrentBatches: this.maxConcurrentBatches
    });
  }

  /**
   * Add log to buffer
   * @param {Object} log - Log entry
   * @returns {Promise<Object>} Processing status
   */
  async add(log) {
    this.buffer.push(log);
    
    // Check if buffer is full
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
    
    return {
      buffered: true,
      bufferSize: this.buffer.length
    };
  }

  /**
   * Add multiple logs to buffer
   * @param {Array} logs - Array of log entries
   * @returns {Promise<Object>} Processing status
   */
  async addBatch(logs) {
    this.buffer.push(...logs);
    
    // Flush if buffer exceeds batch size
    while (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
    
    return {
      buffered: true,
      bufferSize: this.buffer.length,
      added: logs.length
    };
  }

  /**
   * Flush buffer to ClickHouse
   * @returns {Promise<Object>} Flush result
   */
  async flush() {
    // Prevent concurrent flushes beyond limit
    if (this.currentBatches >= this.maxConcurrentBatches) {
      logger.warn('Max concurrent batches reached, waiting...', {
        currentBatches: this.currentBatches
      });
      
      // Wait for a batch to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.flush();
    }

    // Check if there's anything to flush
    if (this.buffer.length === 0) {
      return { flushed: 0 };
    }

    // Extract batch from buffer
    const batchToFlush = this.buffer.splice(0, this.batchSize);
    const batchSize = batchToFlush.length;
    
    this.currentBatches++;
    this.isProcessing = true;

    try {
      const startTime = Date.now();
      
      // Insert batch to ClickHouse
      await clickhouseService.insertLogs(batchToFlush);
      
      const duration = Date.now() - startTime;
      
      this.totalProcessed += batchSize;
      this.totalBatches++;
      
      logger.ingestion(batchSize, duration, {
        bufferRemaining: this.buffer.length,
        totalProcessed: this.totalProcessed
      });

      return {
        flushed: batchSize,
        duration,
        bufferRemaining: this.buffer.length
      };
    } catch (error) {
      logger.error('Batch flush error', { 
        error: error.message,
        batchSize 
      });
      
      // Re-add failed batch to buffer (at the front)
      this.buffer.unshift(...batchToFlush);
      
      throw error;
    } finally {
      this.currentBatches--;
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic flush timer
   */
  startAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.isProcessing) {
        try {
          await this.flush();
        } catch (error) {
          logger.error('Auto-flush error', { error: error.message });
        }
      }
    }, this.batchTimeout);

    logger.info('Auto-flush timer started', { 
      interval: this.batchTimeout 
    });
  }

  /**
   * Stop automatic flush timer
   */
  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      logger.info('Auto-flush timer stopped');
    }
  }

  /**
   * Flush all remaining logs and stop
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down batch processor...');
    
    this.stopAutoFlush();
    
    // Flush all remaining logs
    while (this.buffer.length > 0) {
      await this.flush();
    }
    
    logger.info('Batch processor shutdown complete', {
      totalProcessed: this.totalProcessed,
      totalBatches: this.totalBatches
    });
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      currentBatches: this.currentBatches,
      totalProcessed: this.totalProcessed,
      totalBatches: this.totalBatches,
      avgBatchSize: this.totalBatches > 0 
        ? Math.round(this.totalProcessed / this.totalBatches)
        : 0,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Force flush (manual trigger)
   * @returns {Promise<Object>} Flush result
   */
  async forceFlush() {
    logger.info('Manual flush triggered');
    return this.flush();
  }

  /**
   * Clear buffer (discard all buffered logs)
   * @returns {number} Number of logs discarded
   */
  clearBuffer() {
    const count = this.buffer.length;
    this.buffer = [];
    logger.warn('Buffer cleared', { discarded: count });
    return count;
  }

  /**
   * Set batch size dynamically
   * @param {number} size - New batch size
   */
  setBatchSize(size) {
    if (size < 100 || size > 100000) {
      throw new Error('Batch size must be between 100 and 100000');
    }
    this.batchSize = size;
    logger.info('Batch size updated', { batchSize: size });
  }

  /**
   * Set batch timeout dynamically
   * @param {number} timeout - New timeout in milliseconds
   */
  setBatchTimeout(timeout) {
    if (timeout < 100 || timeout > 60000) {
      throw new Error('Batch timeout must be between 100ms and 60s');
    }
    this.batchTimeout = timeout;
    this.stopAutoFlush();
    this.startAutoFlush();
    logger.info('Batch timeout updated', { batchTimeout: timeout });
  }
}

// Create singleton instance
const batchProcessor = new BatchProcessorService();

// Handle process termination
process.on('SIGINT', async () => {
  await batchProcessor.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await batchProcessor.shutdown();
  process.exit(0);
});

module.exports = batchProcessor;

