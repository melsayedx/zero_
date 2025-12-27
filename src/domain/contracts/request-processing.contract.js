/**
 * RequestProcessingPort - Interface for handling request processing (batching/direct).
 *
 * Defines the contract for any component that acts as a request processor or manager.
 */
class RequestProcessingPort {
  /**
   * Add a request to be processed.
   * @param {*} data - Request data
   * @returns {Promise<*>} Result
   */
  async add(data) {
    throw new Error('Method not implemented');
  }

  /**
   * Force flush any pending requests.
   */
  async forceFlush() {
    throw new Error('Method not implemented');
  }

  /**
   * Get statistics.
   */
  getStats() {
    throw new Error('Method not implemented');
  }

  /**
   * Update configuration.
   * @param {Object} config
   */
  updateConfig(config) {
    throw new Error('Method not implemented');
  }

  /**
   * Enable/Disable processing mode.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    throw new Error('Method not implemented');
  }
}

module.exports = RequestProcessingPort;
