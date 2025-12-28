/**
 * StructuredLogger - Production logging with JSON or pretty-print output.
 * Supports log levels, context inheritance, and optional metrics.
 */
const LoggerContract = require('../../domain/contracts/logger.contract');

const LOG_LEVELS = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
    silent: 100
};

/**
 * ANSI color codes for pretty printing
 */
const COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    trace: '\x1b[90m',    // Gray
    debug: '\x1b[36m',    // Cyan
    info: '\x1b[32m',     // Green
    warn: '\x1b[33m',     // Yellow
    error: '\x1b[31m',    // Red
    fatal: '\x1b[35m'     // Magenta
};

class StructuredLogger extends LoggerContract {
    /**
     * Create a new StructuredLogger instance.
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.level='info'] - Minimum log level
     * @param {boolean} [options.pretty=false] - Use pretty-print with colors
     * @param {Object} [options.context={}] - Default context for all log entries
     * @param {string} [options.name=''] - Logger name (appears in output)
     * @param {boolean} [options.timestamps=true] - Include timestamps
     * @param {Function} [options.output=console.log] - Output function
     * @param {Object} [options.metrics=null] - Metrics collector instance
     */
    constructor(options = {}) {
        super();

        this.level = options.level;
        this.levelValue = LOG_LEVELS[this.level];
        this.pretty = options.pretty;
        this.context = options.context;
        this.name = options.name;
        this.timestamps = options.timestamps;
        this.output = options.output;
        this.errorOutput = options.errorOutput;
        this.metrics = options.metrics;
    }

    /**
     * Check if a log level is enabled.
     * @param {string} level - The level to check
     * @returns {boolean} True if the level should be logged
     */
    isLevelEnabled(level) {
        return LOG_LEVELS[level] >= this.levelValue;
    }

    _log(level, message, context = {}) {
        if (!this.isLevelEnabled(level)) {
            return;
        }

        this.metrics.increment(level);

        const mergedContext = { ...this.context, ...context };
        const error = context instanceof Error ? context : context.error;
        if (error instanceof Error) {
            mergedContext.error = {
                message: error.message,
                stack: error.stack,
                name: error.name
            };
        }

        const timestamp = this.timestamps ? new Date().toISOString() : undefined;

        if (this.pretty) {
            this._prettyPrint(level, message, mergedContext, timestamp);
        } else {
            this._jsonPrint(level, message, mergedContext, timestamp);
        }
    }

    _prettyPrint(level, message, context, timestamp) {
        const color = COLORS[level] || COLORS.reset;
        const levelStr = level.toUpperCase().padEnd(5);
        const nameStr = this.name ? `[${this.name}] ` : '';

        let line = '';

        if (timestamp) {
            line += `${COLORS.dim}${timestamp}${COLORS.reset} `;
        }

        line += `${color}[${levelStr}]${COLORS.reset} ${nameStr}${message}`;

        // Add context if not empty
        const contextKeys = Object.keys(context);
        if (contextKeys.length > 0) {
            const contextStr = JSON.stringify(context);
            line += ` ${COLORS.dim}${contextStr}${COLORS.reset}`;
        }

        // Use error output for error and fatal
        if (level === 'error' || level === 'fatal') {
            this.errorOutput(line);
        } else {
            this.output(line);
        }
    }

    _jsonPrint(level, message, context, timestamp) {
        const entry = {
            level,
            message,
            ...context
        };

        if (timestamp) {
            entry.timestamp = timestamp;
        }

        if (this.name) {
            entry.logger = this.name;
        }

        const line = JSON.stringify(entry);

        // Use error output for error and fatal
        if (level === 'error' || level === 'fatal') {
            this.errorOutput(line);
        } else {
            this.output(line);
        }
    }

    trace(message, context = {}) {
        this._log('trace', message, context);
    }

    debug(message, context = {}) {
        this._log('debug', message, context);
    }

    info(message, context = {}) {
        this._log('info', message, context);
    }

    warn(message, context = {}) {
        this._log('warn', message, context);
    }

    error(message, context = {}) {
        this._log('error', message, context);
    }

    fatal(message, context = {}) {
        this._log('fatal', message, context);
    }

    /**
     * Create a child logger with inherited context.
     * @param {Object} context - Context to merge with parent context
     * @returns {StructuredLogger} A new logger instance with merged context
     */
    child(context) {
        return new StructuredLogger({
            level: this.level,
            pretty: this.pretty,
            context: { ...this.context, ...context },
            name: this.name,
            timestamps: this.timestamps,
            output: this.output,
            errorOutput: this.errorOutput,
            metrics: this.metrics
        });
    }

    getStats() {
        return this.metrics ? this.metrics.getStats() : null;
    }
}

module.exports = StructuredLogger;
module.exports.LOG_LEVELS = LOG_LEVELS;

