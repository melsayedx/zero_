const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

/**
 * Setup and start gRPC server
 * @param {Object} handlers - Object containing handler instances
 * @param {number} port - gRPC server port
 * @returns {grpc.Server} gRPC server instance
 */
function setupGrpcServer(handlers, port = 50051) {
  // Load proto file
  const PROTO_PATH = path.join(__dirname, '../../../proto/logs.proto');
  
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const logsProto = grpc.loadPackageDefinition(packageDefinition).logs;

  // Create gRPC server
  const server = new grpc.Server();

  // Add service with handlers
  server.addService(logsProto.LogService.service, {
    IngestLogs: (call, callback) => handlers.ingestLogsHandler.handle(call, callback),
    GetLogsByAppId: (call, callback) => handlers.getLogsByAppIdHandler.handle(call, callback),
    HealthCheck: (call, callback) => handlers.healthCheckHandler.handle(call, callback)
  });

  // Bind and start server
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error('Failed to start gRPC server:', error);
        throw error;
      }
      console.log(`gRPC server running on: 0.0.0.0:${port}`);
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
        console.error('Error shutting down gRPC server:', error);
        reject(error);
      } else {
        console.log('gRPC server shut down successfully');
        resolve();
      }
    });
  });
}

module.exports = {
  setupGrpcServer,
  shutdownGrpcServer
};

