class ValidationStrategyContract {
    /**
     * Validates and normalizes log batch.
     * @param {Object[]} logsData - Raw logs.
     * @returns {Promise<{validEntries: Object[], errors: Object[]}>} Validation results.
     * @throws {Error} If failure.
     */
    async validateBatch(logsData) {
        throw new Error('Method not implemented: validateBatch()');
    }
}

module.exports = ValidationStrategyContract;
