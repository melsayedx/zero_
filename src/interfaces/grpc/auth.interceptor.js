const jwt = require('jsonwebtoken');
const grpc = require('@grpc/grpc-js');

/**
 * gRPC Authentication Interceptor
 * Validates JWT tokens in gRPC metadata for authenticated methods
 */
class GrpcAuthInterceptor {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    
    // Methods that don't require authentication
    this.publicMethods = [
      '/logs.LogService/HealthCheck'
    ];
  }

  /**
   * Create gRPC interceptor function
   * @returns {Function} gRPC interceptor
   */
  createInterceptor() {
    return (options, nextCall) => {
      return new grpc.InterceptingCall(nextCall(options), {
        start: (metadata, listener, next) => {
          // Get method path
          const methodPath = options.method_definition.path;
          
          // Check if method is public (no auth required)
          if (this.publicMethods.includes(methodPath)) {
            next(metadata, listener);
            return;
          }

          try {
            // Extract token from metadata
            const authMetadata = metadata.get('authorization');
            
            if (!authMetadata || authMetadata.length === 0) {
              // No authorization header
              listener.onReceiveStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Authorization metadata is required',
                metadata: new grpc.Metadata()
              });
              return;
            }

            const authHeader = authMetadata[0];
            
            // Check Bearer format
            if (!authHeader.startsWith('Bearer ')) {
              listener.onReceiveStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Invalid authorization format. Use: Bearer <token>',
                metadata: new grpc.Metadata()
              });
              return;
            }

            // Extract and verify token
            const token = authHeader.substring(7); // Remove 'Bearer ' prefix

            const payload = jwt.verify(token, this.jwtSecret);

            // Add user info to metadata for handlers to access
            metadata.set('user_id', payload.user_id);
            metadata.set('user_email', payload.email);

            // Continue with authenticated request
            next(metadata, listener);

          } catch (error) {
            // Handle JWT errors
            let message = 'Authentication failed';
            
            if (error.name === 'TokenExpiredError') {
              message = 'Token has expired';
            } else if (error.name === 'JsonWebTokenError') {
              message = 'Invalid token';
            }

            console.error('[GrpcAuthInterceptor] Error:', error.message);

            listener.onReceiveStatus({
              code: grpc.status.UNAUTHENTICATED,
              details: message,
              metadata: new grpc.Metadata()
            });
          }
        }
      });
    };
  }
}

/**
 * Create gRPC authentication interceptor
 * @returns {Function} gRPC interceptor function
 */
function createGrpcAuthInterceptor() {
  const interceptor = new GrpcAuthInterceptor();
  return interceptor.createInterceptor();
}

module.exports = createGrpcAuthInterceptor;

