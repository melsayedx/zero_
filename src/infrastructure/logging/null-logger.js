/**
 * NullLogger - Zero-overhead no-op logger (Null Object Pattern). 
 * child() returns same instance to avoid allocations.
 */
const LoggerContract = require('../../domain/contracts/logger.contract');

class NullLogger extends LoggerContract {
    trace() { }
    debug() { }
    info() { }
    warn() { }
    error() { }
    fatal() { }
    child() {
        return this;
    }
}

// Export a singleton for maximum efficiency
const nullLoggerInstance = new NullLogger();

module.exports = NullLogger;
module.exports.instance = nullLoggerInstance;
