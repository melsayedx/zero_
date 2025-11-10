/**
 * HTTP Controllers
 * Handle HTTP requests and responses
 */

const ResponseHelper = require('./response-helper');

/**
 * Controller for ingesting log entries
 * 
 * This is a PRIMARY ADAPTER that depends on the IngestLogPort (input port)
 */
class IngestLogController {
  constructor(ingestLogUseCase) {
    if (!ingestLogUseCase) {
      throw new Error('IngestLogUseCase is required');
    }
    
    // Validate that the use case implements the input port interface
    if (typeof ingestLogUseCase.execute !== 'function') {
      throw new Error('IngestLogUseCase must implement the execute() method from IngestLogPort');
    }
    
    this.ingestLogUseCase = ingestLogUseCase;
  }

  /**
   * Handle POST /api/logs request
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  async handle(req, res) {
    try {
      const logData = req.body;

      // Execute use case
      const result = await this.ingestLogUseCase.execute(logData);

      if (result.success) {
        return ResponseHelper.created(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message, result.error);
      }
    } catch (error) {
      return ResponseHelper.internalError(res, 'Internal server error', error.message);
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
    const timestamp = new Date().toISOString();
    
    try {
      const isHealthy = await this.logRepository.healthCheck();  
      
      if (isHealthy) {
        return ResponseHelper.success(res, {
          message: 'Service is healthy',
          data: { timestamp }
        });
      } else {
        return ResponseHelper.serviceUnavailable(
          res,
          'Service is unhealthy - database connection failed',
          { timestamp }
        );
      }
    } catch (error) {
      return ResponseHelper.serviceUnavailable(
        res,
        'Service is unhealthy',
        { message: error.message , timestamp}
      );
    }
  }
}

/**
 * Controller for batch ingesting log entries
 * 
 * This is a PRIMARY ADAPTER for high-throughput log ingestion
 */
class IngestLogsBatchController {
  constructor(ingestLogsBatchUseCase) {
    if (!ingestLogsBatchUseCase) {
      throw new Error('IngestLogsBatchUseCase is required');
    }
    
    // Validate that the use case implements the input port interface
    if (typeof ingestLogsBatchUseCase.execute !== 'function') {
      throw new Error('IngestLogsBatchUseCase must implement the execute() method');
    }
    
    this.ingestLogsBatchUseCase = ingestLogsBatchUseCase;
  }

  /**
   * Handle POST /api/logs/batch request
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   */
  async handle(req, res) {
    try {
      const { logs } = req.body;

      if (!logs) {
        return ResponseHelper.badRequest(res, 'Missing "logs" field in request body');
      }

      // Execute use case
      const result = await this.ingestLogsBatchUseCase.execute(logs);

      if (result.success) {
        return ResponseHelper.created(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message, result.error);
      }
    } catch (error) {
      return ResponseHelper.internalError(res, 'Internal server error', error.message);
    }
  }
}

module.exports = {
  IngestLogController,
  IngestLogsBatchController,
  HealthCheckController
};

