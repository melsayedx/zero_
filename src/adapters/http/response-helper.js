/**
 * Response Helper
 * Standardizes HTTP responses across all controllers
 */

const HttpStatus = require('../../config/http-status');

class ResponseHelper {
  /**
   * Send a success response
   * @param {Response} res - Express response object
   * @param {Object} options - Response options
   * @param {number} options.statusCode - HTTP status code (default: 200)
   * @param {string} options.message - Success message
   * @param {*} options.data - Response data (optional)
   */
  static success(res, { statusCode = HttpStatus.OK, message, data = null }) {
    const response = {
      success: true,
      message
    };

    if (data !== null) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send an error response
   * @param {Response} res - Express response object
   * @param {Object} options - Response options
   * @param {number} options.statusCode - HTTP status code (default: 500)
   * @param {string} options.message - Error message
   * @param {*} options.error - Error details (optional)
   */
  static error(res, { statusCode = HttpStatus.INTERNAL_SERVER_ERROR, message, error = null }) {
    const response = {
      success: false,
      message
    };

    if (error !== null) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send a created response (201)
   * @param {Response} res - Express response object
   * @param {string} message - Success message
   * @param {*} data - Created resource data
   */
  static created(res, message, data = null) {
    return this.success(res, {
      statusCode: HttpStatus.CREATED,
      message,
      data
    });
  }

  /**
   * Send a bad request response (400)
   * @param {Response} res - Express response object
   * @param {string} message - Error message
   * @param {*} error - Error details
   */
  static badRequest(res, message, error = null) {
    return this.error(res, {
      statusCode: HttpStatus.BAD_REQUEST,
      message,
      error
    });
  }

  /**
   * Send an internal server error response (500)
   * @param {Response} res - Express response object
   * @param {string} message - Error message
   * @param {*} error - Error details
   */
  static internalError(res, message = 'Internal server error', error = null) {
    return this.error(res, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error
    });
  }

  /**
   * Send a service unavailable response (503)
   * @param {Response} res - Express response object
   * @param {string} message - Error message
   * @param {*} error - Error details
   */
  static serviceUnavailable(res, message, error = null) {
    return this.error(res, {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message,
      error
    });
  }
}

module.exports = ResponseHelper;

