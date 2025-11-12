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

      if (result.isFullSuccess() || result.isPartialSuccess()) {
        return res.status(202).json({success: true, message: 'Log data accepted'});
      } else {
        return res.status(400).json({success: false, message: 'Invalid log data'});
      }
    } catch (error) {
      return res.status(500).json({success: false, message: 'Internal server error'});
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
      const isHealthy = await this.logRepository.healthCheck();  

      if (isHealthy.healthy) {
        return res.status(200).json({
          success: true,
          message: 'Service is healthy',
          data: { timestamp: isHealthy.timestamp }
        });
      } else {
        return res.status(503).json({
          success: false,
          message: 'Service is unhealthy - database connection failed',
          error: { timestamp: isHealthy.timestamp  }
        });
      }
    } catch (error) {
      return res.status(503).json({
        success: false,
        message: 'Service is unhealthy',
        error: { message: error.message, timestamp: isHealthy.timestamp  }
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
      const limit = parseInt(req.query.limit) || 1000;  // Default to 100 instead of 10000

      // Execute use case
      const result = await this.getLogsByAppIdUseCase.execute(app_id, limit);
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          message: result.message,
          data: result.data
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
          error: result.error
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = {
  IngestLogController,
  HealthCheckController,
  GetLogsByAppIdController
};

