const grpc = require('@grpc/grpc-js');
const { LogServiceService } = require('../../infrastructure/grpc/generated/proto/logs/logs_grpc_pb');
const { LoggerFactory } = require('../../infrastructure/logging');

const logger = LoggerFactory.named('gRPC Server');

/**
 * Setup and start gRPC server
 * @param {Object} handlers - Object containing handler instances
 * @param {number} port - gRPC server port
 * @returns {grpc.Server} gRPC server instance
 */
function setupGrpcServer(handlers, port = 50051) {
  // Use pre-compiled proto files

  // Create gRPC server
  const server = new grpc.Server();

  // Add service with handlers
  server.addService(LogServiceService, {
    ingestLogs: (call, callback) => handlers.ingestLogsHandler.handle(call, callback),
    getLogsByAppId: (call, callback) => handlers.getLogsByAppIdHandler.handle(call, callback),
    healthCheck: (call, callback) => handlers.healthCheckHandler.handle(call, callback)
  });

  // Bind and start server
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error('Failed to start gRPC server', { error });
        throw error;
      }
      logger.info('gRPC server running', { port });
    }
  );

  return server;
}

/**
 * Gracefully shutdown gRPC server
 * @param {grpc.Server} server - gRPC server instance
 * @returns {Promise<void>}
 */
function shutdownGrpcServer(server) {
  return new Promise((resolve, reject) => {
    server.tryShutdown((error) => {
      if (error) {
        logger.error('Error shutting down gRPC server', { error });
        reject(error);
      } else {
        logger.info('gRPC server shut down successfully');
        resolve();
      }
    });
  });
}

module.exports = {
  setupGrpcServer,
  shutdownGrpcServer
};

