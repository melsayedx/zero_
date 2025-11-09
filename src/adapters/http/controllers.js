/**
 * HTTP Controllers
 * Handle HTTP requests and responses
 */

/**
 * Controller for ingesting log entries
 */
class IngestLogController {
  constructor(ingestLogUseCase) {
    if (!ingestLogUseCase) {
      throw new Error('IngestLogUseCase is required');
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
        return res.status(201).json({
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
      
      if (isHealthy) {
        return res.status(200).json({
          success: true,
          message: 'Service is healthy',
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(503).json({
          success: false,
          message: 'Service is unhealthy - database connection failed',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      return res.status(503).json({
        success: false,
        message: 'Service is unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = {
  IngestLogController,
  HealthCheckController
};

