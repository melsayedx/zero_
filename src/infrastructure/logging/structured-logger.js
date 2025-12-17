/**
 * StructuredLogger - Full-featured structured logging implementation.
 *
 * Provides structured logging with:
 * - JSON output for production (machine-parseable)
 * - Pretty-print with colors for development (human-readable)
 * - Configurable log levels
 * - Context inheritance via child loggers
 * - Optional performance metrics tracking
 *
 * @example
 * ```javascript
 * const logger = new StructuredLogger({ level: 'debug', pretty: true });
 * logger.info('Server started', { port: 3000 });
 * // Output: 2024-01-15T10:30:00.000Z [INFO] Server started {"port":3000}
 * ```
 */
const LoggerContract = require('../../domain/contracts/logger.contract');

/**
 * Log level hierarchy (lower = more verbose)
 */
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
     *
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

        this.level = options.level || 'info';
        this.levelValue = LOG_LEVELS[this.level] || LOG_LEVELS.info;
        this.pretty = options.pretty !== undefined ? options.pretty : (process.env.NODE_ENV !== 'production');
        this.context = options.context || {};
        this.name = options.name || '';
        this.timestamps = options.timestamps !== false;
        this.output = options.output || console.log;
        this.errorOutput = options.errorOutput || console.error;
        this.metrics = options.metrics || null;
    }

    /**
     * Check if a log level is enabled.
     * @param {string} level - The level to check
     * @returns {boolean} True if the level should be logged
     */
    isLevelEnabled(level) {
        return (LOG_LEVELS[level] || LOG_LEVELS.info) >= this.levelValue;
    }

    /**
     * Format and output a log entry.
     * @private
     */
    _log(level, message, context = {}) {
        if (!this.isLevelEnabled(level)) {
            return;
        }

        // Track metrics if enabled
        if (this.metrics) {
            this.metrics.increment(level);
        }

        // Merge contexts
        const mergedContext = { ...this.context, ...context };

        // Handle Error objects in context
        if (context instanceof Error) {
            mergedContext.error = {
                message: context.message,
                stack: context.stack,
                name: context.name
            };
        } else if (context.error instanceof Error) {
            mergedContext.error = {
                message: context.error.message,
                stack: context.error.stack,
                name: context.error.name
            };
        }

        const timestamp = this.timestamps ? new Date().toISOString() : undefined;

        if (this.pretty) {
            this._prettyPrint(level, message, mergedContext, timestamp);
        } else {
            this._jsonPrint(level, message, mergedContext, timestamp);
        }
    }

    /**
     * Pretty print with colors (development mode).
     * @private
     */
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

    /**
     * JSON print (production mode).
     * @private
     */
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

    /**
     * Log a trace-level message.
     */
    trace(message, context = {}) {
        this._log('trace', message, context);
    }

    /**
     * Log a debug-level message.
     */
    debug(message, context = {}) {
        this._log('debug', message, context);
    }

    /**
     * Log an info-level message.
     */
    info(message, context = {}) {
        this._log('info', message, context);
    }

    /**
     * Log a warning-level message.
     */
    warn(message, context = {}) {
        this._log('warn', message, context);
    }

    /**
     * Log an error-level message.
     */
    error(message, context = {}) {
        this._log('error', message, context);
    }

    /**
     * Log a fatal-level message.
     */
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

    /**
     * Get logging statistics (if metrics are enabled).
     * @returns {Object|null} Metrics object or null
     */
    getStats() {
        return this.metrics ? this.metrics.getStats() : null;
    }
}

module.exports = StructuredLogger;
module.exports.LOG_LEVELS = LOG_LEVELS;
