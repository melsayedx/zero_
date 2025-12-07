/**
 * SyncValidationStrategy - Main thread validation strategy.
 *
 * This strategy performs validation synchronously on the main thread using
 * LogEntry.createBatch(). It's the default strategy suitable for small to
 * medium batch sizes where worker thread overhead isn't justified.
 *
 * @example
 * ```javascript
 * const strategy = new SyncValidationStrategy();
 * const result = await strategy.validateBatch(rawLogs);
 * ```
 */

const ValidationStrategyContract = require('../../domain/contracts/validation-strategy.contract');
const LogEntry = require('../../domain/entities/log-entry');

class SyncValidationStrategy extends ValidationStrategyContract {
    /**
     * Validate batch using main thread (synchronous).
     *
     * @param {Object[]} logsData - Array of raw log entry data
     * @returns {Promise<{validEntries: LogEntry[], errors: Array<{data: Object, error: string}>}>}
     */
    async validateBatch(logsData) {
        return await LogEntry.createBatch(logsData);
    }
}

module.exports = SyncValidationStrategy;
