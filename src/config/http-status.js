/**
 * HTTP Status Code Enums
 * Provides meaningful names for HTTP status codes
 */

const HttpStatus = {
  // Success responses
  OK: 200,
  CREATED: 201,
  
  // Client error responses
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  
  // Server error responses
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Freeze the object to prevent modifications
Object.freeze(HttpStatus);

module.exports = HttpStatus;

