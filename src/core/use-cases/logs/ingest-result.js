/**
 * IngestResult - Structured result object for log ingestion operations.
 *
 * This class encapsulates the comprehensive results of log ingestion operations,
 * including success/failure counts, error details, and performance metrics.
 * It provides a consistent interface for reporting ingestion outcomes and
 * includes helper methods for status checking and summary generation.
 *
 * Key features:
 * - Success/failure counts and error details
 * - Performance metrics (processing time, throughput)
 * - Status checking methods (full success, partial success, etc.)
 * - Summary and detailed reporting capabilities
 * - Automatic metadata generation (timestamp, success rate)
 *
 * @example
 * ```javascript
 * // Create result after log ingestion
 * const result = new IngestResult({
 *   accepted: 95,
 *   rejected: 5,
 *   errors: [{ index: 10, error: 'Invalid level' }],
 *   processingTime: 150,
 *   throughput: 667
 * });
 *
 * // Check status
 * if (result.isFullSuccess()) {
 *   console.log('All logs processed successfully');
 * } else if (result.isPartialSuccess()) {
 *   console.log(`${result.accepted} succeeded, ${result.rejected} failed`);
 * }
 *
 * // Get summary for monitoring
 * const summary = result.toSummary();
 * console.log(`Processed ${summary.totalProcessed} logs at ${summary.throughput} logs/sec`);
 * ```
 */
class IngestResult {
  /**
   * Create a new IngestResult instance.
   *
   * @param {Object} params - Result parameters
   * @param {number} params.accepted - Count of successfully validated logs
   * @param {number} params.rejected - Count of failed validations
   * @param {Array} params.errors - Array of validation error objects
   * @param {number} params.processingTime - Processing time in milliseconds
   * @param {number} params.throughput - Throughput in logs per second
   */
  constructor({ accepted, rejected, errors, processingTime, throughput }) {
    this.accepted = accepted;
    this.rejected = rejected;
    this.errors = errors;
    this.totalProcessed = accepted + rejected;

    // Performance metrics
    this.processingTime = processingTime;
    this.throughput = throughput;

    // Metadata
    this.timestamp = new Date().toISOString();
    this.successRate = this.totalProcessed > 0 ? (accepted / this.totalProcessed) * 100 : 0;
  }

  /**
   * Check if any logs were rejected due to validation errors.
   *
   * @returns {boolean} True if any logs failed validation
   *
   * @example
   * ```javascript
   * if (result.hasErrors()) {
   *   console.log(`${result.rejected} logs failed validation`);
   * }
   * ```
   */
  hasErrors() {
    return this.rejected > 0;
  }

  /**
   * Check if the operation was partially successful (some accepted, some rejected).
   *
   * @returns {boolean} True if some logs succeeded and some failed
   *
   * @example
   * ```javascript
   * if (result.isPartialSuccess()) {
   *   console.log('Partial success - review rejected logs');
   * }
   * ```
   */
  isPartialSuccess() {
    return this.accepted > 0 && this.rejected > 0;
  }

  /**
   * Check if all logs were successfully processed.
   *
   * @returns {boolean} True if all logs were accepted and none rejected
   *
   * @example
   * ```javascript
   * if (result.isFullSuccess()) {
   *   console.log('All logs processed successfully');
   * }
   * ```
   */
  isFullSuccess() {
    return this.accepted > 0 && this.rejected === 0;
  }

  /**
   * Check if all logs failed validation.
   *
   * @returns {boolean} True if no logs were accepted and some were rejected
   *
   * @example
   * ```javascript
   * if (result.isFullFailure()) {
   *   console.log('All logs failed - check validation rules');
   * }
   * ```
   */
  isFullFailure() {
    return this.accepted === 0 && this.rejected > 0;
  }

  /**
   * Get the processing throughput in logs per second.
   *
   * Returns the provided throughput value, or calculates it from processing time
   * and total logs if not provided.
   *
   * @returns {number} Throughput in logs per second
   */
  get logsPerSecond() {
    return this.throughput || (this.processingTime > 0 ? (this.totalProcessed / this.processingTime) * 1000 : 0);
  }

  /**
   * Get the average processing latency per log in milliseconds.
   *
   * @returns {number} Average latency in milliseconds per log
   */
  get averageLatency() {
    return this.processingTime > 0 ? this.processingTime / this.totalProcessed : 0;
  }

  /**
   * Generate a summary object for monitoring and logging.
   *
   * Returns key metrics in a format suitable for monitoring systems,
   * dashboards, and log aggregation.
   *
   * @returns {Object} Summary with key performance metrics
   *
   * @example
   * ```javascript
   * const summary = result.toSummary();
   * // {
   * //   totalProcessed: 100,
   * //   accepted: 95,
   * //   rejected: 5,
   * //   successRate: 95.0,
   * //   processingTime: 150,
   * //   throughput: 666.67,
   * //   timestamp: "2024-01-15T10:30:00.000Z"
   * // }
   * ```
   */
  toSummary() {
    return {
      totalProcessed: this.totalProcessed,
      accepted: this.accepted,
      rejected: this.rejected,
      successRate: Math.round(this.successRate * 100) / 100,
      processingTime: this.processingTime,
      throughput: Math.round(this.logsPerSecond * 100) / 100,
      timestamp: this.timestamp
    };
  }

  /**
   * Generate a detailed report including error information.
   *
   * Extends the summary with error details for troubleshooting failed validations.
   *
   * @returns {Object} Detailed report with errors and metadata
   *
   * @example
   * ```javascript
   * const report = result.toDetailedReport();
   * // Includes summary + first 10 errors + error count
   * console.log(`Found ${report.errorCount} validation errors`);
   * ```
   */
  toDetailedReport() {
    return {
      ...this.toSummary(),
      errors: this.errors.slice(0, 10), // First 10 errors
      errorCount: this.errors.length
    };
  }
}

/**
 * @typedef {IngestResult} IngestResult
 * @property {number} accepted - Count of successfully validated logs
 * @property {number} rejected - Count of failed validations
 * @property {Array} errors - Array of validation error objects
 * @property {number} totalProcessed - Total logs processed (accepted + rejected)
 * @property {number} processingTime - Processing time in milliseconds
 * @property {number} throughput - Throughput in logs per second
 * @property {string} timestamp - ISO timestamp of result creation
 * @property {number} successRate - Success rate as percentage (0-100)
 */

module.exports = IngestResult;