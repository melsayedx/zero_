class RequestProcessingPort {
  /**
   * Adds request to processor.
   * @param {*} data - Request data.
   * @returns {Promise<*>} Result.
   */
  async add(data) {
    throw new Error('Method not implemented');
  }

  async forceFlush() {
    throw new Error('Method not implemented');
  }

  getStats() {
    throw new Error('Method not implemented');
  }

  /**
   * Updates configuration.
   * @param {Object} config - New config.
   */
  updateConfig(config) {
    throw new Error('Method not implemented');
  }

  /**
   * Toggles processing mode.
   * @param {boolean} enabled - Mode.
   */
  setEnabled(enabled) {
    throw new Error('Method not implemented');
  }
}

module.exports = RequestProcessingPort;
