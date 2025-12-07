/**
 * ValidationStrategyContract - Abstract interface for log validation strategies.
 *
 * This contract defines the interface that all validation strategies must implement,
 * enabling dependency inversion and allowing different validation approaches
 * (sync, worker-based, external) to be used interchangeably.
 *
 * @example
 * ```javascript
 * class SyncValidationStrategy extends ValidationStrategyContract {
 *   async validateBatch(logsData) {
 *     return await LogEntry.createBatch(logsData);
 *   }
 * }
 *
 * const strategy = new SyncValidationStrategy();
 * const result = await strategy.validateBatch(rawLogs);
 * console.log(`${result.validEntries.length} valid, ${result.errors.length} errors`);
 * ```
 */
class ValidationStrategyContract {
    /**
     * Validate and normalize a batch of log entries.
     *
     * Processes raw log data through validation and normalization, returning
     * validated entries with value objects and any validation errors.
     *
     * @param {Object[]} logsData - Array of raw log entry data
     * @returns {Promise<{validEntries: Object[], errors: Array<{data: Object, error: string}>}>}
     *          Promise resolving to validated entries and errors
     * @throws {Error} If validation fails catastrophically
     *
     * @example
     * ```javascript
     * const result = await strategy.validateBatch([
     *   { app_id: 'app1', message: 'Log 1', level: 'INFO', source: 'api' },
     *   { app_id: '', message: 'Invalid', level: 'INFO', source: 'api' } // Invalid
     * ]);
     * // result.validEntries: [{ appId: AppId, level: LogLevel, ... }]
     * // result.errors: [{ data: {...}, error: 'Missing required field(s): app_id' }]
     * ```
     */
    async validateBatch(logsData) {
        throw new Error('Method not implemented: validateBatch()');
    }
}

module.exports = ValidationStrategyContract;
