/**
 * HTTP Controllers
 * Handle HTTP requests and responses
 */

/**
 * Controller for ingesting log entries
 *
 * This is a PRIMARY ADAPTER that depends on the IngestLogPort (input port)
 */
class IngestLogController {
  constructor(ingestLogUseCase, validationService = null) {
    if (!ingestLogUseCase) {
      throw new Error('IngestLogUseCase is required');
    }

    // Validate that the use case implements the input port interface
    if (typeof ingestLogUseCase.execute !== 'function') {
      throw new Error('IngestLogUseCase must implement the execute() method from IngestLogPort');
    }

    this.ingestLogUseCase = ingestLogUseCase;
    this.validationService = validationService;
  }

  /**
   * Handle POST /api/logs request
   * Supports JSON and Protocol Buffer formats
   * Automatically chooses optimal validation strategy based on batch size and configuration
   *
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  async handle(req, res) {
    try {
      let logData = req.body;

      // Ensure array format for batch validation
      // Middleware typically provides arrays, but handle single objects as fallback
      if (!Array.isArray(logData)) {
        logData = [logData];
      }

      // Choose validation strategy based on batch size and availability of worker threads
      let result;
      const batchSize = logData.length;
      const useWorkers = this.validationService && (
        this.validationService.forceWorkerValidation ||
        (this.validationService.enableWorkerValidation && batchSize >= this.validationService.smallBatchThreshold)
      );

      if (useWorkers) {
        // Use worker threads for validation to prevent main thread blocking
        const isLargeBatch = batchSize >= this.validationService.mediumBatchThreshold;
        result = isLargeBatch
          ? await this.ingestLogUseCase.executeFastWithWorkers(logData, this.validationService)
          : await this.ingestLogUseCase.executeWithWorkers(logData, this.validationService);
      } else {
        // Use standard batch validation (main thread)
        result = await this.ingestLogUseCase.execute(logData);
      }

      if (result.isFullSuccess() || result.isPartialSuccess()) {
        return res.status(202).json({
          success: true,
          message: 'Log data accepted',
          stats: {
            accepted: result.accepted,
            rejected: result.rejected,
            throughput: `${Math.round(result.throughput)} logs/sec`,
            validationStrategy: result.validationStrategy || result.validationMode,
            workerThreads: useWorkers
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid log data',
          errors: result.errors.slice(0, 10) // Show first 10 errors
        });
      }
    } catch (error) {
      console.error('[IngestLogController] Error:', error.message);
      return res.status(500).json({
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

  async handle(req, res) {
    try {
      const healthStatus = await this.logRepository.healthCheck();

      if (healthStatus.healthy) {
        return res.status(200).json({
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
        return res.status(503).json({
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
      return res.status(503).json({
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
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  async handle(req, res) {
    try {
      const { app_id } = req.params;
      const limit = parseInt(req.query.limit) || 1000;

      // Execute use case
      const queryResult = await this.getLogsByAppIdUseCase.execute(app_id, limit);

      // Return successful query result
      return res.status(200).json({
        success: true,
        message: `Retrieved ${queryResult.count} log entries for app_id: ${app_id}`,
        data: queryResult.toDetailedReport()
      });

    } catch (error) {
      // Handle validation and business logic errors
      if (error.message.includes('app_id') || error.message.includes('Limit')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request parameters',
          error: error.message
        });
      }

      // Handle internal errors
      return res.status(500).json({
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
  constructor(logRepository, optimizedIngestService = null, validationService = null, bufferPool = null) {
    this.logRepository = logRepository;
    this.optimizedIngestService = optimizedIngestService;
    this.validationService = validationService;
    this.bufferPool = bufferPool;
  }

  async handle(req, res) {
    try {
      // Get ClickHouse stats and buffer metrics
      const stats = await this.logRepository.getStats();
      
      // Add optimized ingest service stats
      if (this.optimizedIngestService) {
        stats.optimizations = this.optimizedIngestService.getStats();
      }
      
      // Add validation service stats
      if (this.validationService) {
        stats.workerPool = this.validationService.getStats();
      }
      
      // Add buffer pool stats
      if (this.bufferPool) {
        stats.bufferPool = this.bufferPool.getStats();
      }
      
      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      return res.status(500).json({
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

