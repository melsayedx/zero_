/**
 * HTTP Controllers
 * Handle HTTP requests and responses
 */
const { LoggerFactory } = require('../../infrastructure/logging');

const logger = LoggerFactory.named('HTTPController');

/**
 * Controller for ingesting log entries
 *
 * This is a PRIMARY ADAPTER that depends on the IngestLogPort (input port)
 */
class IngestLogController {
  constructor(requestManager) {
    this.requestManager = requestManager;
  }

  /**
   * Handle POST /api/logs request
   * Supports JSON and Protocol Buffer formats
   *
   * @param {FastifyRequest} request - Fastify request
   * @param {FastifyReply} reply - Fastify reply
   */
  async handle(request, reply) {
    try {
      let logData = request.body;

      if (!Array.isArray(logData)) {
        logData = [logData];
      }

      const result = await this.requestManager.add(logData);

      if (result.isFullSuccess()) {
        return reply.code(202).send({
          success: true,
          message: 'Log data accepted',
          stats: {
            accepted: result.accepted,
            rejected: result.rejected,
            throughput: `${Math.round(result.throughput)} logs/sec`
          }
        });
      } else {
        return reply.code(400).send({
          success: false,
          message: 'Invalid log data',
          errors: result.errors.slice(0, 10)
        });
      }
    } catch (error) {
      logger.error('IngestLogController error', { error: error.message });
      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

/**
 * Simple health check controller
 */
class HealthCheckController {
  constructor(logRepository) {
    this.logRepository = logRepository;
  }

  async handle(request, reply) {
    try {
      const healthStatus = await this.logRepository.healthCheck();

      if (healthStatus.healthy) {
        return reply.code(200).send({
          success: true,
          message: 'Service is healthy',
          data: {
            timestamp: healthStatus.timestamp,
            latency: healthStatus.latency,
            pingLatency: healthStatus.pingLatency,
            version: healthStatus.version
          }
        });
      } else {
        return reply.code(503).send({
          success: false,
          message: 'Service is unhealthy - database connection failed',
          error: {
            message: healthStatus.error,
            timestamp: healthStatus.timestamp,
            latency: healthStatus.latency
          }
        });
      }
    } catch (error) {
      return reply.code(503).send({
        success: false,
        message: 'Service is unhealthy',
        error: {
          message: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}

/**
 * Controller for retrieving logs by app_id
 * 
 * This is a PRIMARY ADAPTER that depends on the GetLogsByAppIdUseCase
 */
class GetLogsByAppIdController {
  constructor(getLogsByAppIdUseCase) {
    if (!getLogsByAppIdUseCase) {
      throw new Error('GetLogsByAppIdUseCase is required');
    }

    // Validate that the use case implements the execute method
    if (typeof getLogsByAppIdUseCase.execute !== 'function') {
      throw new Error('GetLogsByAppIdUseCase must implement the execute() method');
    }

    this.getLogsByAppIdUseCase = getLogsByAppIdUseCase;
  }

  /**
   * Handle GET /api/logs/:app_id request
   * @param {FastifyRequest} request - Fastify request
   * @param {FastifyReply} reply - Fastify reply
   */
  async handle(request, reply) {
    try {
      const { app_id } = request.params;
      const limit = parseInt(request.query.limit) || 1000;

      // Execute use case
      const queryResult = await this.getLogsByAppIdUseCase.execute(app_id, limit);

      // Return successful query result
      return reply.code(200).send({
        success: true,
        message: `Retrieved ${queryResult.count} log entries for app_id: ${app_id}`,
        data: queryResult.toDetailedReport()
      });

    } catch (error) {
      // Handle validation and business logic errors
      if (error.message.includes('app_id') || error.message.includes('Limit')) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid request parameters',
          error: error.message
        });
      }

      // Handle internal errors
      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

/**
 * Controller for retrieving batch buffer and system stats
 */
class StatsController {
  constructor(logRepository, optimizedIngestService = null, validationService = null, requestManager = null) {
    this.logRepository = logRepository;
    this.optimizedIngestService = optimizedIngestService;
    this.validationService = validationService;
    this.requestManager = requestManager;
  }

  async handle(request, reply) {
    try {
      // Get ClickHouse stats and buffer metrics
      const stats = await this.logRepository.getStats();

      // Add optimized ingest service stats
      if (this.optimizedIngestService) {
        stats.optimizations = this.optimizedIngestService.getStats();

        // Add coalescer stats from request manager if available
        if (this.requestManager) {
          stats.optimizations.coalescer = this.requestManager.getStats();
        }
      }

      // Add validation service stats
      if (this.validationService) {
        stats.workerPool = this.validationService.getStats();
      }

      return reply.code(200).send({
        success: true,
        data: stats
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: 'Failed to retrieve stats',
        error: error.message
      });
    }
  }
}

module.exports = {
  IngestLogController,
  HealthCheckController,
  GetLogsByAppIdController,
  StatsController
};

