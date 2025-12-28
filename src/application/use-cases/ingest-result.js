/**
 * Structured result object for log ingestion operations including success/failure counts and metrics.
 *
 * @example
 * ```javascript
 * const result = new IngestResult({ accepted: 95, rejected: 5, errors: [], processingTime: 150, throughput: 667 });
 * if (result.hasErrors()) logger.info(`${result.rejected} failed`);
 * ```
 */
class IngestResult {
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

  hasErrors() {
    return this.rejected > 0;
  }

  isPartialSuccess() {
    return this.accepted > 0 && this.rejected > 0;
  }

  isFullSuccess() {
    return this.accepted > 0 && this.rejected === 0;
  }

  get logsPerSecond() {
    return this.throughput || (this.processingTime > 0 ? (this.totalProcessed / this.processingTime) * 1000 : 0);
  }

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

  toDetailedReport() {
    return {
      ...this.toSummary(),
      errors: this.errors.slice(0, 10), // First 10 errors
      errorCount: this.errors.length
    };
  }

}

module.exports = IngestResult;

