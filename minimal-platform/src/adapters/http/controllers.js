/**
 * HTTP Controllers
 * Adapts HTTP requests to use cases
 */

class LogController {
  constructor(ingestLogUseCase) {
    this.ingestLogUseCase = ingestLogUseCase;
  }

  /**
   * Handle POST /api/logs
   */
  async ingestLog(req, res) {
    try {
      const result = await this.ingestLogUseCase.execute(req.body);
      
      if (result.success) {
        return res.status(201).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}

module.exports = { LogController };

