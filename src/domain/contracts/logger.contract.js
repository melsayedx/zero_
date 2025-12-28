/** Abstract logger contract (Null Object Pattern). */
class LoggerContract {

    /**
     * Logs message at specific severity level (trace, debug, info, warn).
     * @param {string} message - Message.
     * @param {Object} [context] - Context data.
     */
    trace(message, context = {}) {
        throw new Error('Method not implemented: trace()');
    }

    debug(message, context = {}) {
        throw new Error('Method not implemented: debug()');
    }

    info(message, context = {}) {
        throw new Error('Method not implemented: info()');
    }

    warn(message, context = {}) {
        throw new Error('Method not implemented: warn()');
    }

    /**
     * Logs high-severity message (error, fatal).
     * @param {string} message - Message.
     * @param {Object|Error} [context] - Context or Error object.
     */
    error(message, context = {}) {
        throw new Error('Method not implemented: error()');
    }

    fatal(message, context = {}) {
        throw new Error('Method not implemented: fatal()');
    }

    /**
     * Creates child logger.
     * @param {Object} context - Merged context.
     * @returns {LoggerContract} Child logger.
     */
    child(context) {
        throw new Error('Method not implemented: child()');
    }
}

module.exports = LoggerContract;
