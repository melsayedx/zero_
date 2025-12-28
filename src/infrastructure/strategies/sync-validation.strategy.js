/**
 * SyncValidationStrategy - Main thread validation.
 * Use for small batches where worker overhead is unjustified.
 */

const ValidationStrategyContract = require('../../domain/contracts/validation-strategy.contract');
const LogEntry = require('../../domain/entities/log-entry');

class SyncValidationStrategy extends ValidationStrategyContract {
    /**
     * Synchronously validates a batch of logs.
     * @param {Object[]} logsData - Raw log data.
     * @returns {Promise<{validEntries: LogEntry[], errors: Array<{data: Object, error: string}>}>} Validation result.
     */
    async validateBatch(logsData) {
        return await LogEntry.createBatch(logsData);
    }
}

module.exports = SyncValidationStrategy;
