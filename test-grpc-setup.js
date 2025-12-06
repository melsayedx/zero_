#!/usr/bin/env node

/**
 * Simple test to verify gRPC setup works with generated proto files
 */

const { setupGrpcServer } = require('./src/interfaces/grpc/server');

// Mock handlers for testing
const mockHandlers = {
  ingestLogsHandler: {
    handle: (call, callback) => {
      callback(null, { success: true, message: 'Test response' });
    }
  },
  getLogsByAppIdHandler: {
    handle: (call, callback) => {
      callback(null, { success: true, message: 'Test response' });
    }
  },
  healthCheckHandler: {
    handle: (call, callback) => {
      callback(null, {
        healthy: true,
        message: 'gRPC server is healthy',
        timestamp: new Date().toISOString(),
        latency_ms: 0,
        ping_latency_ms: 0,
        version: 'test'
      });
    }
  }
};

async function testGrpcSetup() {
  try {
    console.log('Testing gRPC server setup with generated proto files...');

    const server = setupGrpcServer(mockHandlers, 50052); // Use different port

    console.log('✅ gRPC server setup successful!');
    console.log('✅ Generated proto files loaded correctly!');
    console.log('✅ Service registration worked!');

    // Clean shutdown
    setTimeout(() => {
      server.tryShutdown(() => {
        console.log('✅ Server shutdown successful');
        process.exit(0);
      });
    }, 1000);

  } catch (error) {
    console.error('❌ gRPC setup failed:', error.message);
    process.exit(1);
  }
}

testGrpcSetup();
