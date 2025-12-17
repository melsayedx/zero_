/**
 * NullLogger - Zero-overhead no-op logging implementation.
 *
 * This class implements the Null Object Pattern for logging, providing
 * no-op implementations of all logging methods. Use this implementation
 * when logging should be completely disabled with minimal overhead.
 *
 * Performance characteristics:
 * - All methods are empty no-ops
 * - No string formatting or object creation
 * - child() returns the same instance to avoid allocations
 *
 * @example
 * ```javascript
 * const logger = new NullLogger();
 * logger.info('This will do nothing'); // No output, no overhead
 * ```
 */
const LoggerContract = require('../../domain/contracts/logger.contract');

class NullLogger extends LoggerContract {
    /**
     * No-op trace logging.
     */
    trace() { }

    /**
     * No-op debug logging.
     */
    debug() { }

    /**
     * No-op info logging.
     */
    info() { }

    /**
     * No-op warning logging.
     */
    warn() { }

    /**
     * No-op error logging.
     */
    error() { }

    /**
     * No-op fatal logging.
     */
    fatal() { }

    /**
     * Return the same instance to avoid allocations.
     * @returns {NullLogger} This instance
     */
    child() {
        return this;
    }
}

// Export a singleton for maximum efficiency
const nullLoggerInstance = new NullLogger();

module.exports = NullLogger;
module.exports.instance = nullLoggerInstance;
