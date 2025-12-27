const grpc = require('@grpc/grpc-js');
const { LoggerFactory } = require('../../infrastructure/logging');
const {
  IngestLogsResponse,
  IngestError,
  HealthCheckResponse,
  GetLogsByAppIdResponse,
} = require('../../infrastructure/grpc/generated/proto/logs/logs_pb');
const { LogEntry: ProtoLogEntry } = require('../../infrastructure/grpc/generated/proto/logs/log-entry_pb');

const logger = LoggerFactory.named('gRPC');

/**
 * gRPC Handlers
 * Handle gRPC requests and responses
 * 
 * These handlers are PRIMARY ADAPTERS (like HTTP controllers) that depend on use cases
 */


/**
 * Handler for ingesting log entries via gRPC
 * 
 * This is a PRIMARY ADAPTER that depends on the IngestLogPort (input port)
 */
class IngestLogsHandler {
  /**
   * Create a new IngestLogsHandler instance.
   *
   * @param {Object} ingestLogUseCase - Log ingestion use case
   * @param {Object} verifyAppAccessUseCase - App access verification use case
   * @param {Object} [idempotencyStore] - Optional idempotency store for duplicate prevention
   */
  constructor(ingestLogUseCase, verifyAppAccessUseCase, idempotencyStore = null) {
    if (!ingestLogUseCase) {
      throw new Error('IngestLogUseCase is required');
    }

    // Validate that the use case implements the input port interface
    if (typeof ingestLogUseCase.execute !== 'function') {
      throw new Error('IngestLogUseCase must implement the execute() method from IngestLogPort');
    }

    this.ingestLogUseCase = ingestLogUseCase;
    this.verifyAppAccessUseCase = verifyAppAccessUseCase;
    this.idempotencyStore = idempotencyStore;
  }

  /**
   * Handle IngestLogs gRPC call
   * @param {Object} call - gRPC call object with request data
   * @param {Function} callback - gRPC callback function
   */
  async handle(call, callback) {
    try {
      // Extract and verify authentication
      // const user = extractUserFromMetadata(call.metadata);

      // if (!user) {
      //   const error = new Error('Authentication required');
      //   error.code = grpc.status.UNAUTHENTICATED;
      //   return callback(error);
      // }
      const user = { user_id: 'test-user', email: 'test@example.com' }; // Mock user

      // Check for idempotency key in metadata
      let idempotencyKey = null;
      if (this.idempotencyStore) {
        const idempotencyMetadata = call.metadata.get('idempotency-key');
        if (idempotencyMetadata && idempotencyMetadata.length > 0) {
          idempotencyKey = idempotencyMetadata[0];

          // Check if we have a cached response
          const cachedResponse = await this.idempotencyStore.get(idempotencyKey);
          if (cachedResponse) {
            // Hydrate plain object back to Protobuf message
            const response = new IngestLogsResponse();
            response.setSuccess(cachedResponse.success);
            response.setMessage(cachedResponse.message);
            response.setAccepted(cachedResponse.accepted);
            response.setRejected(cachedResponse.rejected);
            response.setProcessingTimeMs(cachedResponse.processingTimeMs);
            response.setThroughput(cachedResponse.throughput);

            if (cachedResponse.errorsList) {
              const errorsList = cachedResponse.errorsList.map(err => {
                const ingestError = new IngestError();
                ingestError.setIndex(err.index);
                ingestError.setError(err.error);
                return ingestError;
              });
              response.setErrorsList(errorsList);
            }

            return callback(null, response);
          }
        }
      }

      const logsList = call.request.getLogsList(); // Get array of LogEntryInput messages

      // Validate request
      if (!logsList || logsList.length === 0) {
        const errorResponse = new IngestLogsResponse();
        errorResponse.setSuccess(false);
        errorResponse.setMessage('No logs provided');
        return callback(null, errorResponse);
      }

      // Convert Protobuf LogEntryInput objects to plain JS objects for internal use cases
      // Or use getters directly. Let's map to plain objects to match UseCase interface.
      const logsData = logsList.map(logProto => ({
        app_id: logProto.getAppId(),
        level: logProto.getLevel(),
        message: logProto.getMessage(),
        source: logProto.getSource() || 'grpc-client',
        environment: logProto.getEnvironment(),
        metadata: logProto.getMetadataMap() ? Object.fromEntries(logProto.getMetadataMap().entries()) : {},
        trace_id: logProto.getTraceId(),
        user_id: logProto.getUserId()
      }));

      // Verify app ownership for all unique app_ids in the batch
      const uniqueAppIds = [...new Set(logsData.map(log => log.app_id).filter(Boolean))];

      for (let i = 0; i < uniqueAppIds.length; i++) {
        const app_id = uniqueAppIds[i];
        /*
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
        */
      }

      // (Transformation moved up before validation/use-case call)

      // Execute use case
      const result = await this.ingestLogUseCase.execute(logsData);

      // Transform IngestResult to gRPC response
      const response = new IngestLogsResponse();

      if (result.isFullSuccess() || result.isPartialSuccess()) {
        response.setSuccess(true);
        response.setMessage('Log data accepted');
      } else {
        response.setSuccess(false);
        response.setMessage('Invalid log data');
      }

      response.setAccepted(result.accepted);
      response.setRejected(result.rejected);
      response.setProcessingTimeMs(result.processingTime);
      response.setThroughput(result.throughput);

      const errorsList = result.errors.map(err => {
        const ingestError = new IngestError();
        ingestError.setIndex(err.index);
        ingestError.setError(err.error);
        return ingestError;
      });
      response.setErrorsList(errorsList);

      // Cache response if idempotency key was provided (fire-and-forget)
      if (idempotencyKey && this.idempotencyStore) {
        // Must serialize to binary/object for storage
        this.idempotencyStore.set(idempotencyKey, response.toObject())
          .catch(err => logger.error('Idempotency cache error', { error: err.message }));
      }

      return callback(null, response);
    } catch (error) {
      logger.error('IngestLogs gRPC error', { error });

      const errorResponse = new IngestLogsResponse();
      errorResponse.setSuccess(false);
      errorResponse.setMessage(`Internal server error: ${error.message}`);
      // Defaults for other fields are fine (0, empty list)

      return callback(null, errorResponse);
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
      const response = new HealthCheckResponse();
      response.setHealthy(healthStatus.healthy);
      response.setMessage(healthStatus.healthy ? 'Service is healthy' : 'Service is unhealthy');
      response.setTimestamp(healthStatus.timestamp);
      response.setLatencyMs(healthStatus.latency);
      response.setPingLatencyMs(healthStatus.pingLatency);
      response.setVersion(healthStatus.version || '');
      response.setError(healthStatus.error || '');

      return callback(null, response);
    } catch (error) {
      logger.error('HealthCheck gRPC error', { error });

      const errorResponse = new HealthCheckResponse();
      errorResponse.setHealthy(false);
      errorResponse.setMessage('Service is unhealthy');
      errorResponse.setTimestamp(new Date().toISOString());
      errorResponse.setError(error.message);

      return callback(null, errorResponse);
    }
  }
}

/**
 * Handler for retrieving logs by app_id via gRPC
 * 
 * This is a PRIMARY ADAPTER that depends on the LogRetrievalUseCase
 */
class LogRetrievalHandler {
  constructor(logRetrievalUseCase, verifyAppAccessUseCase) {
    if (!logRetrievalUseCase) {
      throw new Error('LogRetrievalUseCase is required');
    }

    // Validate that the use case implements the execute method
    if (typeof logRetrievalUseCase.execute !== 'function') {
      throw new Error('LogRetrievalUseCase must implement the execute() method');
    }

    this.logRetrievalUseCase = logRetrievalUseCase;
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
      // const user = extractUserFromMetadata(call.metadata);

      // if (!user) {
      //   const error = new Error('Authentication required');
      //   error.code = grpc.status.UNAUTHENTICATED;
      //   return callback(error);
      // }
      const user = { user_id: 'test-user', email: 'test@example.com' }; // Mock user

      const app_id = call.request.getAppId();
      const limit = call.request.getLimit();
      const queryLimit = limit || 1000;

      // Validate request
      if (!app_id) {
        const errorResponse = new GetLogsByAppIdResponse();
        errorResponse.setSuccess(false);
        errorResponse.setMessage('app_id is required');
        return callback(null, errorResponse);
      }

      // Verify app ownership
      /* 
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
      */

      // Execute use case
      const queryResult = await this.logRetrievalUseCase.execute(app_id, queryLimit);

      // Transform QueryResult to gRPC response (LogEntry with id and timestamp)
      const logsList = queryResult.logs.map(log => {
        const protoLog = new ProtoLogEntry();
        // Set fields on protoLog (assuming setters exist)
        protoLog.setId(log.id);
        protoLog.setAppId(log.app_id);
        protoLog.setLevel(log.level);
        protoLog.setMessage(log.message);
        protoLog.setSource(log.source);
        protoLog.setTimestamp(log.timestamp);
        protoLog.setEnvironment(log.environment || 'prod');
        protoLog.setTraceId(log.trace_id || '');
        protoLog.setUserId(log.user_id || '');

        // Handling map metadata is tricky, usually getMetadataMap().set(key, value)
        const metadataMap = protoLog.getMetadataMap();
        if (log.metadata) {
          Object.entries(log.metadata).forEach(([k, v]) => {
            if (typeof v === 'string') metadataMap.set(k, v);
            else metadataMap.set(k, String(v));
          });
        }
        return protoLog;
      });

      const response = new GetLogsByAppIdResponse();
      response.setSuccess(true);
      response.setMessage(`Retrieved ${queryResult.count} log entries for app_id: ${app_id}`);
      response.setCount(queryResult.count);
      response.setLogsList(logsList);
      response.setHasMore(queryResult.hasMore);
      response.setQueryTimeMs(queryResult.queryTime);

      return callback(null, response);

    } catch (error) {
      logger.error('LogRetrievalHandler gRPC error', { error });

      const errorResponse = new GetLogsByAppIdResponse();
      errorResponse.setSuccess(false);
      errorResponse.setMessage(error.message); // Simplified error message setting

      // Handle validation and business logic errors
      if (error.message.includes('app_id') || error.message.includes('Limit')) {
        errorResponse.setMessage(`Invalid request parameters: ${error.message}`);
      } else {
        errorResponse.setMessage(`Internal server error: ${error.message}`);
      }

      return callback(null, errorResponse);
    }
  }
}

module.exports = {
  IngestLogsHandler,
  HealthCheckHandler,
  LogRetrievalHandler
};

