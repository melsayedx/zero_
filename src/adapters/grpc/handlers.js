const jwt = require('jsonwebtoken');
const grpc = require('@grpc/grpc-js');

/**
 * gRPC Handlers
 * Handle gRPC requests and responses
 * 
 * These handlers are PRIMARY ADAPTERS (like HTTP controllers) that depend on use cases
 */

/**
 * Helper function to extract and verify JWT from gRPC metadata
 * @param {Object} metadata - gRPC metadata
 * @returns {Object|null} { user_id, email } or null if invalid
 */
function extractUserFromMetadata(metadata) {
  const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  
  try {
    const authMetadata = metadata.get('authorization');
    
    if (!authMetadata || authMetadata.length === 0) {
      return null;
    }

    const authHeader = authMetadata[0];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, jwtSecret);

    return {
      user_id: payload.user_id,
      email: payload.email
    };
  } catch (error) {
    console.error('[gRPC Auth] Token verification failed:', error.message);
    return null;
  }
}

/**
 * Handler for ingesting log entries via gRPC
 * 
 * This is a PRIMARY ADAPTER that depends on the IngestLogPort (input port)
 */
class IngestLogsHandler {
  constructor(ingestLogUseCase, verifyAppAccessUseCase) {
    if (!ingestLogUseCase) {
      throw new Error('IngestLogUseCase is required');
    }
    
    // Validate that the use case implements the input port interface
    if (typeof ingestLogUseCase.execute !== 'function') {
      throw new Error('IngestLogUseCase must implement the execute() method from IngestLogPort');
    }
    
    this.ingestLogUseCase = ingestLogUseCase;
    this.verifyAppAccessUseCase = verifyAppAccessUseCase;
  }

  /**
   * Handle IngestLogs gRPC call
   * @param {Object} call - gRPC call object with request data
   * @param {Function} callback - gRPC callback function
   */
  async handle(call, callback) {
    try {
      // Extract and verify authentication
      const user = extractUserFromMetadata(call.metadata);
      
      if (!user) {
        const error = new Error('Authentication required');
        error.code = grpc.status.UNAUTHENTICATED;
        return callback(error);
      }

      const { logs } = call.request;

      // Validate request
      if (!logs || logs.length === 0) {
        return callback(null, {
          success: false,
          message: 'No logs provided',
          accepted: 0,
          rejected: 0,
          processing_time_ms: 0,
          throughput: 0,
          errors: []
        });
      }

<<<<<<< HEAD
      // Transform gRPC LogEntryInput to application format
      // Note: id and timestamp are NOT included - server generates these
=======
      // Verify app ownership for all unique app_ids in the batch
      const uniqueAppIds = [...new Set(logs.map(log => log.app_id).filter(Boolean))];
      
      for (const app_id of uniqueAppIds) {
        if (this.verifyAppAccessUseCase) {
          const accessResult = await this.verifyAppAccessUseCase.execute({
            app_id,
            user_id: user.user_id
          });

          if (!accessResult.success || !accessResult.hasAccess) {
            const error = new Error(`You do not have access to app: ${app_id}`);
            error.code = grpc.status.PERMISSION_DENIED;
            return callback(error);
          }
        }
      }

      // Transform gRPC LogEntry to application format
>>>>>>> mongodb
      const logsData = logs.map(log => ({
        app_id: log.app_id,
        level: log.level,
        message: log.message,
        source: log.source || 'grpc-client',  // Required field
        environment: log.environment,         // Optional
        metadata: log.metadata || {},
        trace_id: log.trace_id,              // Optional
        user_id: log.user_id                 // Optional
        // timestamp: NOT included - ClickHouse generates with DEFAULT now()
        // id: NOT included - LogEntry entity generates UUID
      }));

      // Execute use case
      const result = await this.ingestLogUseCase.execute(logsData);

      // Transform IngestResult to gRPC response
      if (result.isFullSuccess() || result.isPartialSuccess()) {
        return callback(null, {
          success: true,
          message: 'Log data accepted',
          accepted: result.accepted,
          rejected: result.rejected,
          processing_time_ms: result.processingTime,
          throughput: result.throughput,
          errors: result.errors.map(err => ({
            index: err.index,
            error: err.error
          }))
        });
      } else {
        return callback(null, {
          success: false,
          message: 'Invalid log data',
          accepted: result.accepted,
          rejected: result.rejected,
          processing_time_ms: result.processingTime,
          throughput: result.throughput,
          errors: result.errors.map(err => ({
            index: err.index,
            error: err.error
          }))
        });
      }
    } catch (error) {
      console.error('IngestLogs gRPC error:', error);
      // Return error as gRPC response (not gRPC error status)
      return callback(null, {
        success: false,
        message: `Internal server error: ${error.message}`,
        accepted: 0,
        rejected: 0,
        processing_time_ms: 0,
        throughput: 0,
        errors: []
      });
    }
  }
}

/**
 * Handler for health check via gRPC
 */
class HealthCheckHandler {
  constructor(logRepository) {
    if (!logRepository) {
      throw new Error('LogRepository is required');
    }
    this.logRepository = logRepository;
  }

  async handle(call, callback) {
    try {
      const healthStatus = await this.logRepository.healthCheck();

      return callback(null, {
        healthy: healthStatus.healthy,
        message: healthStatus.healthy ? 'Service is healthy' : 'Service is unhealthy',
        timestamp: healthStatus.timestamp,
        latency_ms: healthStatus.latency,
        ping_latency_ms: healthStatus.pingLatency,
        version: healthStatus.version || '',
        error: healthStatus.error || ''
      });
    } catch (error) {
      console.error('HealthCheck gRPC error:', error);
      return callback(null, {
        healthy: false,
        message: 'Service is unhealthy',
        timestamp: new Date().toISOString(),
        latency_ms: 0,
        ping_latency_ms: 0,
        version: '',
        error: error.message
      });
    }
  }
}

/**
 * Handler for retrieving logs by app_id via gRPC
 * 
 * This is a PRIMARY ADAPTER that depends on the GetLogsByAppIdUseCase
 */
class GetLogsByAppIdHandler {
  constructor(getLogsByAppIdUseCase, verifyAppAccessUseCase) {
    if (!getLogsByAppIdUseCase) {
      throw new Error('GetLogsByAppIdUseCase is required');
    }
    
    // Validate that the use case implements the execute method
    if (typeof getLogsByAppIdUseCase.execute !== 'function') {
      throw new Error('GetLogsByAppIdUseCase must implement the execute() method');
    }
    
    this.getLogsByAppIdUseCase = getLogsByAppIdUseCase;
    this.verifyAppAccessUseCase = verifyAppAccessUseCase;
  }

  /**
   * Handle GetLogsByAppId gRPC call
   * @param {Object} call - gRPC call object with request data
   * @param {Function} callback - gRPC callback function
   */
  async handle(call, callback) {
    try {
      // Extract and verify authentication
      const user = extractUserFromMetadata(call.metadata);
      
      if (!user) {
        const error = new Error('Authentication required');
        error.code = grpc.status.UNAUTHENTICATED;
        return callback(error);
      }

      const { app_id, limit } = call.request;
      const queryLimit = limit || 1000;

      // Validate request
      if (!app_id) {
        return callback(null, {
          success: false,
          message: 'app_id is required',
          count: 0,
          logs: [],
          has_more: false,
          query_time_ms: 0
        });
      }

      // Verify app ownership
      if (this.verifyAppAccessUseCase) {
        const accessResult = await this.verifyAppAccessUseCase.execute({
          app_id,
          user_id: user.user_id
        });

        if (!accessResult.success || !accessResult.hasAccess) {
          const error = new Error('You do not have access to this app');
          error.code = grpc.status.PERMISSION_DENIED;
          return callback(error);
        }
      }

      // Execute use case
      const queryResult = await this.getLogsByAppIdUseCase.execute(app_id, queryLimit);

      // Transform QueryResult to gRPC response (LogEntry with id and timestamp)
      const logs = queryResult.logs.map(log => ({
        id: log.id,                          // Server-generated UUID
        app_id: log.app_id,
        level: log.level,
        message: log.message,
        source: log.source,
        timestamp: log.timestamp,            // Server-generated timestamp
        environment: log.environment || 'prod',
        metadata: log.metadata || {},
        trace_id: log.trace_id || '',
        user_id: log.user_id || ''
      }));

      return callback(null, {
        success: true,
        message: `Retrieved ${queryResult.count} log entries for app_id: ${app_id}`,
        count: queryResult.count,
        logs: logs,
        has_more: queryResult.hasMore,
        query_time_ms: queryResult.queryTime
      });

    } catch (error) {
      console.error('GetLogsByAppId gRPC error:', error);
      
      // Handle validation and business logic errors
      if (error.message.includes('app_id') || error.message.includes('Limit')) {
        return callback(null, {
          success: false,
          message: `Invalid request parameters: ${error.message}`,
          count: 0,
          logs: [],
          has_more: false,
          query_time_ms: 0
        });
      }

      // Handle internal errors
      return callback(null, {
        success: false,
        message: `Internal server error: ${error.message}`,
        count: 0,
        logs: [],
        has_more: false,
        query_time_ms: 0
      });
    }
  }
}

module.exports = {
  IngestLogsHandler,
  HealthCheckHandler,
  GetLogsByAppIdHandler
};

