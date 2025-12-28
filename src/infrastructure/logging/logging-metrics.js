class LoggingMetrics {
    constructor() {
        this.counts = {
            trace: 0,
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            fatal: 0
        };
        this.lastReset = Date.now();
        this.totalLogs = 0;
    }

    /**
     * Increment the count for a log level.
     * @param {string} level - The log level
     */
    increment(level) {
        if (this.counts.hasOwnProperty(level)) {
            this.counts[level]++;
            this.totalLogs++;
        }
    }

    getStats() {
        const uptimeMs = Date.now() - this.lastReset;
        const uptimeSec = uptimeMs / 1000;

        return {
            counts: { ...this.counts },
            total: this.totalLogs,
            uptimeMs,
            logsPerSecond: uptimeSec > 0 ? (this.totalLogs / uptimeSec).toFixed(2) : 0,
            errorRate: this.totalLogs > 0
                ? ((this.counts.error + this.counts.fatal) / this.totalLogs * 100).toFixed(2) + '%'
                : '0.00%'
        };
    }

    reset() {
        Object.keys(this.counts).forEach(key => {
            this.counts[key] = 0;
        });
        this.totalLogs = 0;
        this.lastReset = Date.now();
    }
}

module.exports = LoggingMetrics;

