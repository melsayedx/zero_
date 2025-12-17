/**
 * LoggerContract - Abstract interface defining the contract for logging implementations.
 *
 * This contract follows the Null Object Pattern, enabling zero-overhead logging disable
 * by swapping implementations without conditional checks throughout the codebase.
 *
 * Log Levels (in order of severity):
 * - trace: Fine-grained debugging information
 * - debug: Debug information useful during development
 * - info: General informational messages
 * - warn: Warning conditions that should be addressed
 * - error: Error conditions that need attention
 * - fatal: Critical errors that may cause application termination
 *
 * @example
 * ```javascript
 * // Usage with dependency injection
 * class MyService {
 *   constructor(logger) {
 *     this.logger = logger;
 *   }
 *
 *   process(data) {
 *     this.logger.info('Processing data', { count: data.length });
 *   }
 * }
 * ```
 */
class LoggerContract {
    /**
     * Log a trace-level message.
     * @param {string} message - The message to log
     * @param {Object} [context={}] - Additional context data
     */
    trace(message, context = {}) {
        throw new Error('Method not implemented: trace()');
    }

    /**
     * Log a debug-level message.
     * @param {string} message - The message to log
     * @param {Object} [context={}] - Additional context data
     */
    debug(message, context = {}) {
        throw new Error('Method not implemented: debug()');
    }

    /**
     * Log an info-level message.
     * @param {string} message - The message to log
     * @param {Object} [context={}] - Additional context data
     */
    info(message, context = {}) {
        throw new Error('Method not implemented: info()');
    }

    /**
     * Log a warning-level message.
     * @param {string} message - The message to log
     * @param {Object} [context={}] - Additional context data
     */
    warn(message, context = {}) {
        throw new Error('Method not implemented: warn()');
    }

    /**
     * Log an error-level message.
     * @param {string} message - The message to log
     * @param {Object|Error} [context={}] - Additional context data or Error object
     */
    error(message, context = {}) {
        throw new Error('Method not implemented: error()');
    }

    /**
     * Log a fatal-level message.
     * @param {string} message - The message to log
     * @param {Object|Error} [context={}] - Additional context data or Error object
     */
    fatal(message, context = {}) {
        throw new Error('Method not implemented: fatal()');
    }

    /**
     * Create a child logger with inherited context.
     * @param {Object} context - Context to merge with parent context
     * @returns {LoggerContract} A new logger instance with merged context
     */
    child(context) {
        throw new Error('Method not implemented: child()');
    }
}

module.exports = LoggerContract;
