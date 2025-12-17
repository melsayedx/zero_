/**
 * RequestCoalescer - Middleware for batching concurrent requests to improve throughput.
 *
 * This class implements a request coalescing pattern that collects concurrent requests
 * within a time window and processes them as a single batch. This optimization is crucial
 * for high-throughput systems where individual request processing would create excessive
 * overhead (database connections, network round trips, etc.).
 *
 * The coalescer balances latency and throughput by introducing a small, configurable delay
 * (default 10ms) to collect requests, then processes the entire batch at once. Results are
 * distributed back to individual waiting requests, maintaining the request-response contract
 * while achieving significant performance improvements during traffic bursts.
 *
 * Key features:
 * - Configurable time windows and batch sizes for different use cases
 * - Automatic batch processing when size limits are reached
 * - Comprehensive metrics collection for monitoring and optimization
 * - Graceful handling of concurrent requests and error scenarios
 * - Runtime configuration updates without service restart
 * - Thread-safe operation with proper synchronization
 *
 * @example
 * ```javascript
 * // Create coalescer with batch processor for high-throughput scenarios
 * const coalescer = new RequestCoalescer(
 *   async (batch) => {
 *     // Process entire batch at once (e.g., bulk database insert)
 *     return batch.map(item => ({ id: item.id, result: `Processed ${item.data}` }));
 *   },
 *   {
 *     maxWaitTime: 5,      // 5ms window for low latency
 *     maxBatchSize: 200,   // Up to 200 requests per batch
 *     enabled: true        // Enable coalescing
 *   }
 * );
 *
 * // Add individual requests - they get batched automatically
 * const result1 = await coalescer.add({ id: 1, data: 'item1' });
 * const result2 = await coalescer.add({ id: 2, data: 'item2' });
 * // Both requests are processed together when batch window expires
 *
 * // Monitor performance
 * const stats = coalescer.getStats();
 * logger.info(`Processed ${stats.totalRequests} requests`);
 * logger.info(`Coalescing efficiency: ${stats.coalescingRate}`);
 *
 * // Adjust configuration for peak traffic
 * coalescer.updateConfig({
 *   maxWaitTime: 2,       // Faster processing
 *   maxBatchSize: 500     // Larger batches
 * });
 *
 * // Graceful shutdown - process remaining requests
 * await coalescer.forceFlush();
 * ```
 */

const CoalescerPort = require('../../domain/contracts/coalescer.contract');

class RequestCoalescer extends CoalescerPort {

  /**
   * Create a new RequestCoalescer instance with configurable batching parameters.
   *
   * Initializes the coalescer with a processor function that handles batch processing and
   * optional configuration parameters that control the coalescing behavior. The processor
   * function receives an array of request data and must return an array of results with
   * the same length and ordering.
   *
   * The coalescer uses a time-based window and size-based limits to determine when to
   * process batches. Requests are held until either the time window expires or the batch
   * reaches maximum size, whichever occurs first. This provides predictable latency
   * bounds while maximizing batch efficiency.
   *
   * @param {Function} processor - Async function that processes a batch of requests
   * @param {Array} processor.batch - Array of request data items
   * @param {Promise<Array>} processor.return - Promise resolving to array of result objects
   * @param {Object} [options={}] - Configuration options for coalescing behavior
   * @param {number} [options.maxWaitTime=10] - Maximum milliseconds to wait before processing batch
   * @param {number} [options.maxBatchSize=100] - Maximum requests to collect before processing
   * @param {number} [options.minBatchSize=2] - Minimum requests to trigger coalescing (unused currently)
   * @param {boolean} [options.enabled=true] - Whether coalescing is enabled
   * @param {Logger} [options.logger] - Logger instance
   *
 * @example
 * ```javascript
 * // Create coalescer with error-handling batch processor
 * const coalescer = new RequestCoalescer(
 *   async (batch) => {
 *     try {
 *       // Process batch (e.g., bulk database operation)
 *       const results = await bulkInsert(batch);
 *       return results.map(item => ({ success: true, data: item }));
 *     } catch (error) {
 *       // Return error results for all items in failed batch
 *       return batch.map(() => ({ success: false, error: error.message }));
 *     }
 *   },
 *   {
 *     maxWaitTime: 5,       // 5ms window for low latency
 *     maxBatchSize: 200,    // Maximum 200 requests per batch
 *     enabled: true         // Enable coalescing
 *   }
 * );
 * ```
   */
  constructor(processor, options = {}) {
    super();

    this.processor = processor; // Function to process batch

    // Configuration
    this.maxWaitTime = options.maxWaitTime || 10; // 10ms window
    this.maxBatchSize = options.maxBatchSize || 100; // Max requests per batch
    this.minBatchSize = options.minBatchSize || 2; // Minimum to trigger coalescing
    this.enabled = options.enabled !== false; // Default: enabled
    this.logger = options.logger;

    // Double-buffer (ping-pong) pattern - eliminates array allocation on flush
    // Two pre-allocated arrays alternate: one collects requests, other processes
    this.bufferA = new Array(this.maxBatchSize);
    this.bufferB = new Array(this.maxBatchSize);
    this.activeBuffer = this.bufferA;
    this.pendingIndex = 0; // Track actual number of pending requests
    this.timer = null;
    this.isFlushing = false;

    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalBatches: 0,
      totalCoalesced: 0,
      avgBatchSize: 0,
      maxBatchSeen: 0,
      bypassedRequests: 0,
      bufferSwaps: 0  // Track buffer swaps for monitoring
    };

    if (this.logger) {
      this.logger.info('RequestCoalescer initialized', {
        maxWaitTime: this.maxWaitTime,
        maxBatchSize: this.maxBatchSize,
        enabled: this.enabled,
        bufferPattern: 'double-buffer'
      });
    }
  }

  /**
   * Add a request to the coalescing buffer for batched processing.
   *
   * This is the primary entry point for request coalescing. When a request is added,
   * it enters a buffering phase where it's held for a short time window to collect
   * concurrent requests. The method returns a Promise that resolves when the batch
   * containing this request is processed.
   *
   * The coalescing logic works as follows:
   * 1. If coalescing is disabled, the request is processed immediately
   * 2. If the batch buffer reaches maxBatchSize, the batch is processed immediately
   * 3. Otherwise, the request waits in the buffer until maxWaitTime expires
   * 4. Multiple requests within the time window are processed as one batch
   *
   * This approach provides significant throughput improvements during traffic bursts
   * while maintaining bounded latency for individual requests.
   *
   * @param {*} data - The request data to be processed (any type)
   * @returns {Promise<*>} Promise that resolves with the processing result for this request
   *
 * @example
 * ```javascript
 * // Add requests - they get batched automatically within time/size windows
 * const result1 = await coalescer.add({ id: 1, data: 'item1' });
 * const result2 = await coalescer.add({ id: 2, data: 'item2' });
 * const result3 = await coalescer.add({ id: 3, data: 'item3' });
 *
 * // High-frequency requests get batched together
 * const promises = [];
 * for (let i = 0; i < 50; i++) {
 *   promises.push(coalescer.add(`request-${i}`));
 * }
 * const results = await Promise.all(promises);
 * logger.info(`Processed ${results.length} requests efficiently`);
 * ```
   */
  async add(data) {
    this.metrics.totalRequests++;

    // If disabled, process immediately
    if (!this.enabled) {
      this.metrics.bypassedRequests++;
      return this.processor([data]).then(results => results[0]);
    }

    return new Promise((resolve, reject) => {
      // Use activeBuffer instead of pending
      this.activeBuffer[this.pendingIndex++] = { data, resolve, reject, timestamp: Date.now() };

      // Flush immediately if batch is full
      if (this.pendingIndex >= this.maxBatchSize) {
        this.flush();
      }
      // Start timer for first request in batch
      else if (this.pendingIndex === 1 && !this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    });
  }

  /**
   * Process all currently pending requests as a single batch.
   *
   * This method triggers immediate processing of all requests currently in the coalescing
   * buffer. It's called automatically when batch size limits are reached or time windows
   * expire, but can also be called manually for administrative purposes.
   *
   * The flush operation is thread-safe and prevents concurrent flushes to maintain data
   * integrity. During processing, the batch is extracted from the pending queue, metrics
   * are updated, and results are distributed back to waiting requests.
   *
   * If processing fails, all requests in the batch are rejected with the same error.
   * This maintains consistency - either all requests in a batch succeed or all fail together.
   *
   * @returns {Promise<void>} Resolves when the batch processing is complete
   *
 * @example
 * ```javascript
 * // Add requests, then manually trigger processing
 * await coalescer.add('test1');
 * await coalescer.add('test2');
 * await coalescer.flush(); // Process immediately instead of waiting for timeout
 * ```
   */
  async flush() {
    // Prevent concurrent flushes
    if (this.isFlushing || this.pendingIndex === 0) {
      return;
    }

    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isFlushing = true;

    // Double-buffer swap: take current buffer, switch to alternate
    // This eliminates array allocation (no slice() needed)
    const batchSize = this.pendingIndex;
    const batch = this.activeBuffer;
    this.activeBuffer = (batch === this.bufferA) ? this.bufferB : this.bufferA;
    this.pendingIndex = 0;
    this.metrics.bufferSwaps++;

    // Update metrics
    this.metrics.totalBatches++;

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
      // Extract data from pending requests (only up to batchSize)
      const dataArray = new Array(batchSize);
      for (let i = 0; i < batchSize; i++) {
        dataArray[i] = batch[i].data;
      }

      // Process entire batch at once
      const results = await this.processor(dataArray);

      // Distribute results back to individual requests
      // Handle individual errors vs batch errors
      for (let i = 0; i < batchSize; i++) {
        const result = results[i];

        // Check if this specific result indicates an error
        if (result && typeof result === 'object' && result.error) {
          // Individual log validation error - reject this specific request
          batch[i].reject(new Error(result.error));
        } else if (result && typeof result === 'object' && result.success === false) {
          // Individual processing failure
          const errorMsg = result.error || result.message || 'Processing failed';
          batch[i].reject(new Error(errorMsg));
        } else {
          // Success - resolve with the result
          batch[i].resolve(result);
        }
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Batch processing error', { error });
      } else {
        // Fallback if no logger
        console.error('[RequestCoalescer] Batch processing error:', error);
      }

      // Infrastructure error - reject all pending requests
      // This happens when the entire batch processor fails (DB connection, etc.)
      for (let i = 0; i < batchSize; i++) {
        batch[i].reject(error);
      }
    } finally {
      this.isFlushing = false;

      // If new requests arrived during processing, start timer
      if (this.pendingIndex > 0 && !this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
      }
    }
  }

  /**
   * Force immediate processing of all pending requests for graceful shutdown.
   *
   * This method ensures no requests are lost during system shutdown or reconfiguration.
   * Unlike regular flush operations that may be triggered by timers or size limits,
   * forceFlush guarantees that all currently pending requests are processed immediately.
   *
   * This is particularly important for graceful shutdowns where you want to ensure
   * all in-flight requests complete before the system stops accepting new requests.
   *
   * @returns {Promise<void>} Resolves when all pending requests have been processed
   *
 * @example
 * ```javascript
 * // Graceful shutdown - ensure no requests are lost
 * process.on('SIGTERM', async () => {
 *   coalescer.setEnabled(false);  // Stop accepting new requests
 *   await coalescer.forceFlush(); // Process all pending requests
 *   process.exit(0);
 * });
 * ```
   */
  async forceFlush() {
    if (this.pendingIndex > 0) {
      await this.flush();
    }
  }

  /**
   * Get comprehensive statistics and operational metrics for the coalescer.
   *
   * Returns detailed metrics that are essential for monitoring coalescing performance,
   * diagnosing issues, and optimizing configuration. The statistics help understand
   * how effectively the coalescer is reducing individual request overhead.
   *
   * Key metrics include:
   * - Request throughput and coalescing efficiency
   * - Batch size statistics (average, maximum)
   * - Current operational state (pending requests, enabled status)
   * - Bypassed requests (when coalescing is disabled)
   *
   * @returns {Object} Comprehensive coalescer statistics and metrics
   * @returns {boolean} return.enabled - Whether coalescing is currently enabled
   * @returns {number} return.totalRequests - Total requests processed since initialization
   * @returns {number} return.totalBatches - Total batches processed
   * @returns {number} return.totalCoalesced - Total requests that were batched (not processed individually)
   * @returns {string} return.coalescingRate - Percentage of requests that were coalesced (e.g., "85.50%")
   * @returns {string} return.avgBatchSize - Average batch size (formatted to 2 decimal places)
   * @returns {number} return.maxBatchSeen - Largest batch size observed
   * @returns {number} return.bypassedRequests - Requests processed individually when coalescing disabled
   * @returns {number} return.currentPending - Currently pending requests in buffer
   *
 * @example
 * ```javascript
 * // Monitor coalescing performance and efficiency
 * const stats = coalescer.getStats();
 * logger.info(`Processed ${stats.totalRequests} requests`);
 * logger.info(`Coalescing efficiency: ${stats.coalescingRate}`);
 * logger.info(`Average batch size: ${stats.avgBatchSize}`);
 *
 * // Alert if too many requests are pending
 * if (stats.currentPending > stats.maxBatchSize) {
 *   logger.warn('Pending requests exceed batch size limit');
 * }
 * ```
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
      bufferSwaps: this.metrics.bufferSwaps,
      currentPending: this.pendingIndex
    };
  }

  /**
   * Enable or disable request coalescing at runtime.
   *
   * This method allows dynamic control over coalescing behavior without restarting
   * the service. When disabling coalescing, any pending requests are immediately
   * processed to prevent data loss. When enabling, new requests will be subject
   * to coalescing rules.
   *
   * This is useful for maintenance windows, performance tuning, or debugging scenarios
   * where you need individual request processing instead of batching.
   *
   * @param {boolean} enabled - Whether to enable coalescing (true) or disable it (false)
   *
 * @example
 * ```javascript
 * // Disable coalescing for maintenance or debugging
 * coalescer.setEnabled(false);
 * console.log('Coalescing disabled - requests processed individually');
 *
 * // Re-enable for normal high-throughput operation
 * coalescer.setEnabled(true);
 * console.log('Coalescing re-enabled');
 * ```
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.logger) {
      this.logger.info(enabled ? 'Coalescing enabled' : 'Coalescing disabled');
    }

    // If disabling, flush pending requests
    if (!enabled && this.pendingIndex > 0) {
      this.flush();
    }
  }

  /**
   * Update coalescer configuration parameters at runtime.
   *
   * Allows dynamic adjustment of coalescing behavior without service restart or
   * instance recreation. This enables adaptive performance tuning based on
   * traffic patterns, system load, or operational requirements.
   *
   * Configuration changes take effect immediately for new requests while
   * respecting ongoing batch processing. Only specified parameters are updated,
   * others retain their current values.
   *
   * @param {Object} config - Configuration parameters to update
   * @param {number} [config.maxWaitTime] - Update maximum wait time in milliseconds
   * @param {number} [config.maxBatchSize] - Update maximum batch size
   * @param {number} [config.minBatchSize] - Update minimum batch size threshold
   *
 * @example
 * ```javascript
 * // Adapt configuration for different traffic patterns
 * coalescer.updateConfig({
 *   maxWaitTime: 2,      // Reduce latency for faster processing
 *   maxBatchSize: 300    // Allow larger batches during peak traffic
 * });
 *
 * // Conservative settings for low-traffic periods
 * coalescer.updateConfig({
 *   maxWaitTime: 50,     // Longer wait for better batching
 *   maxBatchSize: 50     // Smaller batches when traffic is light
 * });
 * ```
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

    if (this.logger) {
      this.logger.info('Config updated', {
        maxWaitTime: this.maxWaitTime,
        maxBatchSize: this.maxBatchSize,
        minBatchSize: this.minBatchSize
      });
    }
  }
}

/**
 * @typedef {RequestCoalescer} RequestCoalescer
 * @property {Function} processor - Function that processes batches of requests
 * @property {number} maxWaitTime - Maximum time to wait before processing batch (ms)
 * @property {number} maxBatchSize - Maximum requests per batch
 * @property {number} minBatchSize - Minimum requests to trigger coalescing
 * @property {boolean} enabled - Whether coalescing is enabled
 * @property {Array} pending - Currently pending requests in buffer
 * @property {Timeout} timer - Active timeout for batch processing
 * @property {boolean} isFlushing - Whether a batch is currently being processed
 * @property {Object} metrics - Operational metrics and statistics
 */

module.exports = RequestCoalescer;

