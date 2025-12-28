/** Abstract logger contract (Null Object Pattern). */
class LoggerContract {
    /**
     * Logs trace message.
     * @param {string} message - Message.
     * @param {Object} [context] - Context data.
     */
    trace(message, context = {}) {
        throw new Error('Method not implemented: trace()');
    }

    /**
     * Logs debug message.
     * @param {string} message - Message.
     * @param {Object} [context] - Context data.
     */
    debug(message, context = {}) {
        throw new Error('Method not implemented: debug()');
    }

    /**
     * Logs info message.
     * @param {string} message - Message.
     * @param {Object} [context] - Context data.
     */
    info(message, context = {}) {
        throw new Error('Method not implemented: info()');
    }

    /**
     * Logs warning message.
     * @param {string} message - Message.
     * @param {Object} [context] - Context data.
     */
    warn(message, context = {}) {
        throw new Error('Method not implemented: warn()');
    }

    /**
     * Logs error message.
     * @param {string} message - Message.
     * @param {Object|Error} [context] - Context or Error.
     */
    error(message, context = {}) {
        throw new Error('Method not implemented: error()');
    }

    /**
     * Logs fatal message.
     * @param {string} message - Message.
     * @param {Object|Error} [context] - Context or Error.
     */
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
