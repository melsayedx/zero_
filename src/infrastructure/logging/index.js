/**
 * Logging Module - Barrel export for all logging components.
 *
 * Usage:
 * ```javascript
 * const { LoggerFactory, NullLogger, StructuredLogger, LoggingMetrics } = require('./logging');
 *
 * // Quick start
 * const logger = LoggerFactory.getInstance();
 * logger.info('Application started');
 * ```
 */

const LoggerContract = require('../../domain/contracts/logger.contract');
const NullLogger = require('./null-logger');
const StructuredLogger = require('./structured-logger');
const LoggerFactory = require('./logger-factory');
const LoggingMetrics = require('./logging-metrics');

module.exports = {
    LoggerContract,
    NullLogger,
    StructuredLogger,
    LoggerFactory,
    LoggingMetrics
};
