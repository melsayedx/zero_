class IngestResult {
    constructor({ accepted, rejected, errors, processingTime, throughput, validationMode = 'full' }) {
        this.accepted = accepted;           // Count of successfully validated logs
        this.rejected = rejected;           // Count of failed validations
        this.errors = errors;               // Array of validation errors
        this.totalProcessed = accepted + rejected;

        // Performance metrics
        this.processingTime = processingTime;  // Time in milliseconds
        this.throughput = throughput;          // Logs per second
        this.validationMode = validationMode; // 'full', 'light', 'skip'

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

    isFullFailure() {
        return this.accepted === 0 && this.rejected > 0;
    }

    // Performance getters
    get logsPerSecond() {
        return this.throughput || (this.processingTime > 0 ? (this.totalProcessed / this.processingTime) * 1000 : 0);
    }

    get averageLatency() {
        return this.processingTime > 0 ? this.processingTime / this.totalProcessed : 0;
    }

    // Summary for monitoring
    toSummary() {
        return {
            totalProcessed: this.totalProcessed,
            accepted: this.accepted,
            rejected: this.rejected,
            successRate: Math.round(this.successRate * 100) / 100,
            processingTime: this.processingTime,
            throughput: Math.round(this.logsPerSecond * 100) / 100,
            validationMode: this.validationMode,
            timestamp: this.timestamp
        };
    }

    // Detailed report
    toDetailedReport() {
        return {
            ...this.toSummary(),
            errors: this.errors.slice(0, 10), // First 10 errors
            errorCount: this.errors.length
        };
    }
}

module.exports = IngestResult;