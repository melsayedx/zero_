const grpc = require('@grpc/grpc-js');
const { LogServiceService } = require('../../infrastructure/grpc/generated/proto/logs/logs_grpc_pb');


/**
 * Setup and start gRPC server
 * @param {Object} handlers - Object containing handler instances
 * @param {number} port - gRPC server port
 * @param {Object} rootLogger - Application logger instance
 * @returns {Promise<grpc.Server>} gRPC server instance
 */
function setupGrpcServer(handlers, port = 50051, rootLogger) {
  const logger = rootLogger.child({ component: 'gRPC Server' });
  return new Promise((resolve, reject) => {
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
          reject(error);
          return;
        }
        logger.info('gRPC server running', { port });
        resolve(server);
      }
    );
  });
}

/**
 * Gracefully shutdown gRPC server
 * @param {grpc.Server} server - gRPC server instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<void>}
 */
function shutdownGrpcServer(server, logger) {
  return new Promise((resolve, reject) => {
    // Force shutdown after 5 seconds if graceful shutdown fails
    const forceShutdownTimeout = setTimeout(() => {
      logger.warn('gRPC server taking too long to shutdown, forcing...');
      server.forceShutdown();
      resolve();
    }, 5000);

    server.tryShutdown((error) => {
      clearTimeout(forceShutdownTimeout);
      if (error) {
        logger.error('Error shutting down gRPC server, forcing shutdown', { error });
        server.forceShutdown();
        resolve();
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

