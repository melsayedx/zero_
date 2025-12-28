class IngestLogController {
  constructor(requestManager, logger) {
    this.requestManager = requestManager;
    this.logger = logger;
  }

  async handle(request, reply) {
    try {
      let logData = request.body;
      logData = !Array.isArray(logData) ? [logData] : logData;

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
      this.logger.error('IngestLogController error', { error: error.message });
      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

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

class LogRetrievalController {
  constructor(logRetrievalUseCase) {
    if (!logRetrievalUseCase) {
      throw new Error('LogRetrievalUseCase is required');
    }

    this.logRetrievalUseCase = logRetrievalUseCase;
  }

  async handle(request, reply) {
    try {
      const { app_id } = request.params;
      const limit = parseInt(request.query.limit) || 1000;

      const queryResult = await this.logRetrievalUseCase.execute(app_id, limit);

      return reply.code(200).send({
        success: true,
        message: `Retrieved ${queryResult.count} log entries for app_id: ${app_id}`,
        data: queryResult.toDetailedReport()
      });

    } catch (error) {
      if (error.message.includes('app_id') || error.message.includes('Limit')) {
        return reply.code(400).send({
          success: false,
          message: 'Invalid request parameters',
          error: error.message
        });
      }

      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

class StatsController {
  constructor(logRepository, logIngestionService = null, validationService = null, requestManager = null) {
    this.logRepository = logRepository;
    this.logIngestionService = logIngestionService;
    this.validationService = validationService;
    this.requestManager = requestManager;
  }

  async handle(request, reply) {
    try {
      const stats = await this.logRepository.getStats();

      if (this.logIngestionService) {
        stats.optimizations = this.logIngestionService.getStats();

        if (this.requestManager) {
          stats.optimizations.coalescer = this.requestManager.getStats();
        }
      }

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

class SemanticSearchController {
  constructor(semanticSearchUseCase, logger) {
    this.semanticSearchUseCase = semanticSearchUseCase;
    this.logger = logger;
  }

  async handle(request, reply) {
    try {
      const { query, app_id, limit = 20, level, time_range } = request.body;

      if (!query || typeof query !== 'string') {
        return reply.code(400).send({
          success: false,
          message: 'Query string is required',
          error: 'Missing or invalid query parameter'
        });
      }

      const result = await this.semanticSearchUseCase.execute({
        query,
        appId: app_id,
        limit,
        level,
        timeRange: time_range
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          message: 'Search request failed',
          error: result.error
        });
      }

      return reply.code(200).send({
        success: true,
        message: `Found ${result.logs.length} similar logs`,
        data: {
          query: result.query,
          logs: result.logs,
          metadata: result.metadata
        }
      });

    } catch (error) {
      this.logger.error('SemanticSearchController error', { error: error.message });
      return reply.code(500).send({
        success: false,
        message: 'Semantic search failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = {
  IngestLogController,
  HealthCheckController,
  LogRetrievalController,
  StatsController,
  SemanticSearchController
};

