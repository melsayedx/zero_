/**
 * LoggerFactory - Factory for creating logger instances.
 *
 * Provides a consistent way to create logger instances based on configuration.
 * Supports environment variable overrides and maintains a singleton for DI.
 *
 * Environment Variables:
 * - LOG_MODE: 'null', 'silent', 'disabled' for NullLogger; 'structured' (default)
 * - LOG_LEVEL: 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'
 * - LOG_PRETTY: 'true' or 'false' (overrides auto-detection)
 *
 * @example
 * ```javascript
 * // Basic usage
 * const logger = LoggerFactory.create();
 *
 * // With options
 * const logger = LoggerFactory.create({
 *   level: 'debug',
 *   name: 'MyService'
 * });
 *
 * // Disable logging entirely
 * const nullLogger = LoggerFactory.create({ mode: 'null' });
 * ```
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
     *
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
            const mode = options.mode || process.env.LOG_MODE || 'structured';
            const level = options.level || process.env.LOG_LEVEL || 'info';

            // Check for null/disabled modes
            const isDisabled = ['null', 'silent', 'disabled', 'none', 'off'].includes(mode.toLowerCase());

            if (isDisabled) {
                return NullLogger.instance;
            }

            // Determine pretty-print setting
            let pretty = options.pretty;
            if (pretty === undefined) {
                if (process.env.LOG_PRETTY !== undefined) {
                    pretty = process.env.LOG_PRETTY === 'true';
                } else {
                    // Auto-detect: pretty for development, JSON for production
                    pretty = process.env.NODE_ENV !== 'production';
                }
            }

            // Create metrics if requested
            let metrics = null;
            if (options.enableMetrics) {
                metrics = options.metrics || new LoggingMetrics();
            }

            return new StructuredLogger({
                level,
                pretty,
                name: options.name || '',
                context: options.context || {},
                timestamps: options.timestamps !== false,
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
     *
     * This is useful for DI containers where a single logger should be shared.
     *
     * @param {Object} [options={}] - Configuration options (only used on first call)
     * @returns {LoggerContract} The singleton logger instance
     */
    static getInstance(options = {}) {
        if (!singletonLogger) {
            // Enable metrics for singleton by default
            singletonLogger = LoggerFactory.create({
                enableMetrics: true,
                ...options
            });
        }
        return singletonLogger;
    }

    /**
     * Get the singleton metrics instance.
     *
     * @returns {LoggingMetrics|null} The metrics instance or null
     */
    static getMetrics() {
        if (!singletonMetrics && singletonLogger) {
            singletonMetrics = singletonLogger.metrics;
        }
        return singletonMetrics;
    }

    /**
     * Reset the singleton (mainly for testing).
     */
    static resetSingleton() {
        singletonLogger = null;
        singletonMetrics = null;
    }

    /**
     * Create a child logger from the singleton with additional context.
     *
     * @param {Object} context - Context to add to the child logger
     * @returns {LoggerContract} A child logger with merged context
     */
    static child(context) {
        return LoggerFactory.getInstance().child(context);
    }

    /**
     * Create a named logger (convenience method).
     *
     * @param {string} name - The logger name
     * @param {Object} [options={}] - Additional options
     * @returns {LoggerContract} A named logger instance
     */
    static named(name, options = {}) {
        return LoggerFactory.create({
            ...options,
            name
        });
    }
}

module.exports = LoggerFactory;
