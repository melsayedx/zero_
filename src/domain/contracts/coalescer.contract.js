/**
 * CoalescerContract - Interface for request coalescing functionality.
 *
 * This contract defines the interface for request coalescing implementations that batch
 * concurrent requests to improve throughput. The coalescing pattern collects requests
 * within a time window and processes them as a single batch, significantly reducing
 * overhead for high-throughput scenarios.
 *
 * Key responsibilities:
 * - Collect concurrent requests within configurable time windows
 * - Process requests in batches to optimize resource utilization
 * - Maintain request-response correlation for individual results
 * - Provide monitoring and configuration capabilities
 *
 * Implementations should ensure thread-safety and proper error handling while
 * maintaining the request-response contract for individual callers.
 *
 * @interface
 */
class CoalescerContract {
  /**
   * Add a request to the coalescing batch
   * @param {*} data - The request data to be processed
   * @returns {Promise<*>} Promise resolving to the result for this specific request
   */
  async add(data) {
    throw new Error('add must be implemented by subclass');
  }

  /**
   * Force immediate processing of any pending requests
   * @returns {Promise<void>}
   */
  async forceFlush() {
    throw new Error('forceFlush must be implemented by subclass');
  }

  /**
   * Get comprehensive statistics about coalescing performance
   * @returns {Object} Statistics object with metrics
   */
  getStats() {
    throw new Error('getStats must be implemented by subclass');
  }

  /**
   * Update coalescing configuration at runtime
   * @param {Object} config - New configuration options
   * @param {number} [config.maxWaitTime] - Maximum wait time in milliseconds
   * @param {number} [config.maxBatchSize] - Maximum batch size
   * @param {boolean} [config.enabled] - Whether coalescing is enabled
   */
  updateConfig(config) {
    throw new Error('updateConfig must be implemented by subclass');
  }

  /**
   * Enable or disable coalescing functionality
   * @param {boolean} enabled - Whether to enable coalescing
   */
  setEnabled(enabled) {
    throw new Error('setEnabled must be implemented by subclass');
  }

  /**
   * Clean up resources during shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    throw new Error('shutdown must be implemented by subclass');
  }
}

module.exports = CoalescerContract;
