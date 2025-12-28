/**
 * LoggerFactory - Creates logger instances based on config.
 * Supports env overrides (LOG_MODE, LOG_LEVEL, LOG_PRETTY) and maintains singleton.
 */
const NullLogger = require('./null-logger');
const StructuredLogger = require('./structured-logger');
const LoggingMetrics = require('./logging-metrics');

// Singleton instances
let singletonLogger = null;
let singletonMetrics = null;

class LoggerFactory {
    /**
     * Create a new logger instance based on configuration.
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.mode] - Logger mode: 'null', 'silent', 'disabled', 'structured'
     * @param {string} [options.level] - Log level
     * @param {boolean} [options.pretty] - Use pretty-print output
     * @param {string} [options.name] - Logger name
     * @param {Object} [options.context] - Default context
     * @param {boolean} [options.enableMetrics=false] - Enable logging metrics
     * @returns {LoggerContract} A logger instance
     */
    static create(options = {}) {
        try {
            // Determine mode from options or environment
            const mode = options.mode;
            const level = options.level;

            // Check for null/disabled modes
            const isDisabled = ['null', 'silent', 'disabled', 'none', 'off'].includes(mode.toLowerCase());

            if (isDisabled) {
                return NullLogger.instance;
            }

            let pretty = options.pretty;
            let metrics = options.metrics || new LoggingMetrics();

            return new StructuredLogger({
                level,
                pretty,
                name: options.name,
                context: options.context,
                timestamps: options.timestamps,
                metrics,
                output: options.output,
                errorOutput: options.errorOutput
            });

        } catch (error) {
            // Factory should never throw - fall back to NullLogger
            console.error('[LoggerFactory] Failed to create logger, falling back to NullLogger:', error.message);
            return NullLogger.instance;
        }
    }

    /**
     * Get or create the singleton logger instance.
     * This is useful for DI containers where a single logger should be shared.
     *
     * @param {Object} [options={}] - Configuration options (only used on first call)
     * @returns {LoggerContract} The singleton logger instance
     */
    static getInstance(options = {}) {
        return singletonLogger || (singletonLogger = LoggerFactory.create({ ...options }));
    }

    static getMetrics() {
        if (!singletonMetrics && singletonLogger) {
            singletonMetrics = singletonLogger.metrics;
        }
        return singletonMetrics;
    }

    /**
     * Create a child logger from the singleton with additional context.
     * @param {Object} context - Context to add to the child logger
     * @returns {LoggerContract} A child logger with merged context
     */
    static child(context) {
        return LoggerFactory.getInstance().child(context);
    }

}

module.exports = LoggerFactory;
