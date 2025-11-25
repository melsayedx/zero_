/**
 * CoalescerPort - Interface defining the contract for request/operation coalescing strategies.
 *
 * This port abstracts the coalescing behavior used for batching concurrent operations
 * to improve throughput. It enables different coalescing implementations (in-memory,
 * Redis-backed, distributed) to be used interchangeably while maintaining a consistent API.
 *
 * Coalescing implementations should balance latency and throughput by:
 * - Collecting concurrent operations within configurable time windows
 * - Processing operations in batches when size or time limits are reached
 * - Providing individual result delivery despite batch processing
 * - Supporting runtime configuration and monitoring
 *
 * @example
 * ```javascript
 * // Usage in application services
 * class LogIngestionService {
 *   constructor(ingestUseCase, coalescer) {
 *     this.ingestUseCase = ingestUseCase;
 *     this.coalescer = coalescer; // CoalescerPort implementation
 *   }
 *
 *   async ingest(logs) {
 *     if (logs.length < 50) {
 *       return this.coalescer.add(logs); // Returns Promise with result
 *     }
 *     // Process immediately for large batches
 *   }
 * }
 *
 * // Different implementations
 * const inMemoryCoalescer = new InMemoryCoalescer(processor, options);
 * const redisCoalescer = new RedisBackedCoalescer(processor, redisClient, options);
 * ```
 */

class CoalescerPort {
  /**
   * Add an operation to the coalescing buffer for batched processing.
   *
   * This method accepts an operation for coalescing and returns a Promise that resolves
   * when the operation is processed (either individually or as part of a batch). The
   * implementation decides whether to process immediately or buffer for batching based
   * on current load, configuration, and coalescing strategy.
   *
   * @param {*} operation - The operation data to be processed
   * @returns {Promise<*>} Promise that resolves with the operation result
   *
   * @example
   * ```javascript
   * // Add operation to coalescing buffer
   * const result = await coalescer.add({
   *   type: 'log-ingestion',
   *   data: logEntries
   * });
   *
   * console.log('Operation completed:', result);
   * ```
   */
  async add(operation) {
    throw new Error('Method not implemented: add()');
  }

  /**
   * Force immediate processing of all currently buffered operations.
   *
   * Triggers immediate batch processing of all operations currently in the coalescing buffer,
   * bypassing normal time and size thresholds. Useful for graceful shutdowns or when
   * immediate processing is required.
   *
   * @returns {Promise<void>} Resolves when all buffered operations are processed
   *
   * @example
   * ```javascript
   * // Graceful shutdown
   * process.on('SIGTERM', async () => {
   *   await coalescer.forceFlush(); // Process remaining operations
   *   process.exit(0);
   * });
   * ```
   */
  async forceFlush() {
    throw new Error('Method not implemented: forceFlush()');
  }

  /**
   * Get comprehensive statistics and operational metrics for the coalescer.
   *
   * Returns detailed metrics about coalescing performance, including throughput,
   * batch sizes, efficiency rates, and operational status. Essential for monitoring
   * and optimizing coalescing behavior.
   *
   * @returns {Object} Comprehensive coalescer statistics and metrics
   * @returns {boolean} return.enabled - Whether coalescing is currently active
   * @returns {number} return.totalRequests - Total operations processed
   * @returns {number} return.totalBatches - Total batches processed
   * @returns {number} return.totalCoalesced - Operations that were batched
   * @returns {string} return.coalescingRate - Percentage of operations coalesced
   * @returns {string} return.avgBatchSize - Average operations per batch
   * @returns {number} return.maxBatchSeen - Largest batch size observed
   * @returns {number} return.bypassedRequests - Operations processed individually
   * @returns {number} return.currentPending - Currently buffered operations
   *
   * @example
   * ```javascript
   * const stats = coalescer.getStats();
   * console.log(`Processed ${stats.totalRequests} operations`);
   * console.log(`Coalescing efficiency: ${stats.coalescingRate}`);
   * console.log(`Average batch size: ${stats.avgBatchSize}`);
   * ```
   */
  getStats() {
    throw new Error('Method not implemented: getStats()');
  }

  /**
   * Enable or disable coalescing at runtime.
   *
   * Dynamically controls whether coalescing is active. When disabled, operations
   * are processed immediately without batching. When re-enabled, normal coalescing
   * behavior resumes. Useful for maintenance windows or performance tuning.
   *
   * @param {boolean} enabled - Whether to enable coalescing
   *
   * @example
   * ```javascript
   * // Disable for maintenance
   * coalescer.setEnabled(false);
   * console.log('Coalescing disabled');
   *
   * // Re-enable for normal operation
   * coalescer.setEnabled(true);
   * console.log('Coalescing re-enabled');
   * ```
   */
  setEnabled(enabled) {
    throw new Error('Method not implemented: setEnabled()');
  }

  /**
   * Update coalescing configuration parameters at runtime.
   *
   * Allows dynamic adjustment of coalescing behavior without service restart.
   * Changes take effect immediately for new operations while respecting ongoing batches.
   * Enables adaptive performance tuning based on traffic patterns and system load.
   *
   * @param {Object} config - Configuration parameters to update
   * @param {number} [config.maxWaitTime] - Maximum wait time before processing batch
   * @param {number} [config.maxBatchSize] - Maximum operations per batch
   * @param {number} [config.minBatchSize] - Minimum operations to trigger coalescing
   *
   * @example
   * ```javascript
   * // Optimize for high traffic
   * coalescer.updateConfig({
   *   maxWaitTime: 5,      // Faster processing
   *   maxBatchSize: 200    // Larger batches
   * });
   *
   * // Conservative settings for low traffic
   * coalescer.updateConfig({
   *   maxWaitTime: 50,     // Longer wait for batching
   *   maxBatchSize: 50     // Smaller batches acceptable
   * });
   * ```
   */
  updateConfig(config) {
    throw new Error('Method not implemented: updateConfig()');
  }
}

/**
 * @typedef {CoalescerPort} CoalescerPort
 * @property {Function} add - Add operation for coalescing
 * @property {Function} forceFlush - Force immediate processing
 * @property {Function} getStats - Get performance metrics
 * @property {Function} setEnabled - Enable/disable coalescing
 * @property {Function} updateConfig - Update configuration
 */

module.exports = CoalescerPort;
