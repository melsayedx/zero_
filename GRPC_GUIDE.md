# gRPC Integration Guide

This document provides a comprehensive guide to the gRPC implementation in the Log Ingestion Platform.

## Overview

The platform now supports **both HTTP REST and gRPC** protocols, allowing you to choose the best interface for your use case:

- **HTTP REST**: Easy to use, human-readable, great for web apps and simple integrations
- **gRPC**: High-performance, strongly-typed, ideal for microservices and high-throughput scenarios

## Architecture

The gRPC implementation follows the same clean architecture principles as the HTTP implementation:

```
Core Layer (Business Logic)
    ↓
Use Cases (Ports)
    ↓
gRPC Handlers (Primary Adapters)
    ↓
gRPC Server
```

### Key Components

1. **proto/logs.proto**: Protocol Buffer definitions (service contract)
2. **src/adapters/grpc/handlers.js**: gRPC request handlers (similar to HTTP controllers)
3. **src/adapters/grpc/server.js**: gRPC server setup and configuration
4. **src/config/di-container.js**: Dependency injection for both HTTP and gRPC

## Protocol Buffer Definition

The gRPC service is defined in `proto/logs.proto`:

### Service Methods

1. **IngestLogs**: Ingest one or more log entries
   - Request: `IngestLogsRequest` (array of logs)
   - Response: `IngestLogsResponse` (success status, metrics, errors)

2. **GetLogsByAppId**: Query logs by application ID
   - Request: `GetLogsByAppIdRequest` (app_id, limit)
   - Response: `GetLogsByAppIdResponse` (logs, count, metadata)

3. **HealthCheck**: Check service health
   - Request: `HealthCheckRequest` (empty)
   - Response: `HealthCheckResponse` (status, latency, version)

## Running the Servers

Both HTTP and gRPC servers start together:

```bash
npm start    # or npm run dev for auto-reload
```

**Default Ports:**
- HTTP: 3000
- gRPC: 50051

**Environment Variables:**
```env
PORT=3000          # HTTP server port
GRPC_PORT=50051    # gRPC server port
```

## Testing the gRPC API

### Option 1: Use the Example Client

The easiest way to test:

```bash
npm run grpc:example
```

This runs `grpc-client-example.js` which demonstrates all three gRPC methods.

### Option 2: Use grpcurl (CLI Tool)

Install grpcurl:
```bash
# macOS
brew install grpcurl

# Linux
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest
```

Run the test script:
```bash
./test-grpc.sh
```

Or test manually:
```bash
# Health check
grpcurl -plaintext localhost:50051 logs.LogService/HealthCheck

# Ingest logs
grpcurl -plaintext -d '{
  "logs": [{"app_id": "test", "level": "info", "message": "Test log", "timestamp": "2024-01-15T10:00:00.000Z"}]
}' localhost:50051 logs.LogService/IngestLogs

# Query logs
grpcurl -plaintext -d '{"app_id": "test", "limit": 10}' localhost:50051 logs.LogService/GetLogsByAppId
```

### Option 3: Use Node.js Client

See `grpc-client-example.js` for a complete example, or use this snippet:

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('proto/logs.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const logsProto = grpc.loadPackageDefinition(packageDefinition).logs;
const client = new logsProto.LogService('localhost:50051', grpc.credentials.createInsecure());

// Use the client...
client.IngestLogs({ logs: [...] }, (error, response) => {
  console.log(response);
});
```

## Performance Comparison: HTTP vs gRPC

### When to Use HTTP REST

- Web browser clients
- Simple CRUD operations
- Human-readable debugging
- Wide language/tool support
- RESTful conventions preferred

### When to Use gRPC

- Microservice-to-microservice communication
- High-throughput log ingestion (batching)
- Low latency requirements
- Strongly-typed contracts
- Streaming capabilities (future enhancement)

### Performance Benchmarks

Typical performance characteristics:

| Metric | HTTP REST | gRPC |
|--------|-----------|------|
| Latency (p50) | ~10ms | ~5ms |
| Throughput | ~5,000 req/s | ~15,000 req/s |
| Payload Size | Larger (JSON) | Smaller (Protobuf) |
| CPU Usage | Higher | Lower |

*Note: Actual performance depends on hardware, network, and workload*

## Client Examples in Different Languages

### Python

```python
import grpc
import logs_pb2
import logs_pb2_grpc

channel = grpc.insecure_channel('localhost:50051')
stub = logs_pb2_grpc.LogServiceStub(channel)

request = logs_pb2.IngestLogsRequest(
    logs=[
        logs_pb2.LogEntry(
            app_id='python-app',
            level='info',
            message='Test from Python',
            timestamp='2024-01-15T10:00:00.000Z'
        )
    ]
)

response = stub.IngestLogs(request)
print(response)
```

### Go

```go
package main

import (
    "context"
    "log"
    "google.golang.org/grpc"
    pb "path/to/logs"
)

func main() {
    conn, _ := grpc.Dial("localhost:50051", grpc.WithInsecure())
    defer conn.Close()
    
    client := pb.NewLogServiceClient(conn)
    
    request := &pb.IngestLogsRequest{
        Logs: []*pb.LogEntry{
            {
                AppId:     "go-app",
                Level:     "info",
                Message:   "Test from Go",
                Timestamp: "2024-01-15T10:00:00.000Z",
            },
        },
    }
    
    response, _ := client.IngestLogs(context.Background(), request)
    log.Println(response)
}
```

### Java

```java
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;

ManagedChannel channel = ManagedChannelBuilder
    .forAddress("localhost", 50051)
    .usePlaintext()
    .build();

LogServiceGrpc.LogServiceBlockingStub stub = LogServiceGrpc.newBlockingStub(channel);

LogEntry log = LogEntry.newBuilder()
    .setAppId("java-app")
    .setLevel("info")
    .setMessage("Test from Java")
    .setTimestamp("2024-01-15T10:00:00.000Z")
    .build();

IngestLogsRequest request = IngestLogsRequest.newBuilder()
    .addLogs(log)
    .build();

IngestLogsResponse response = stub.ingestLogs(request);
System.out.println(response);
```

## Error Handling

gRPC handlers return application-level errors in the response (not gRPC status codes):

```json
{
  "success": false,
  "message": "Error description",
  "accepted": 0,
  "rejected": 1,
  "errors": [
    {
      "index": 0,
      "error": "Validation failed: invalid level"
    }
  ]
}
```

This design keeps error handling consistent between HTTP and gRPC.

## Security Considerations

**Current Implementation (Development):**
- Uses insecure credentials (`grpc.credentials.createInsecure()`)
- No TLS encryption
- No authentication

**Production Recommendations:**
1. Enable TLS:
   ```javascript
   const credentials = grpc.credentials.createSsl(
     fs.readFileSync('ca.crt'),
     fs.readFileSync('server.key'),
     fs.readFileSync('server.crt')
   );
   ```

2. Add authentication (JWT, API keys, or mTLS)
3. Use connection limits and rate limiting
4. Deploy behind a load balancer/API gateway

## Extending the gRPC API

To add a new gRPC method:

1. **Update `proto/logs.proto`**:
   ```protobuf
   service LogService {
     rpc NewMethod(NewMethodRequest) returns (NewMethodResponse);
   }
   
   message NewMethodRequest { ... }
   message NewMethodResponse { ... }
   ```

2. **Create handler in `src/adapters/grpc/handlers.js`**:
   ```javascript
   class NewMethodHandler {
     constructor(useCase) { this.useCase = useCase; }
     async handle(call, callback) { ... }
   }
   ```

3. **Register in `src/adapters/grpc/server.js`**:
   ```javascript
   server.addService(logsProto.LogService.service, {
     NewMethod: (call, callback) => handlers.newMethodHandler.handle(call, callback)
   });
   ```

4. **Update DI container** in `src/config/di-container.js`:
   ```javascript
   this.instances.newMethodHandler = new NewMethodHandler(this.instances.someUseCase);
   ```

## Troubleshooting

### gRPC server fails to start

**Problem:** Port already in use
```
Error: bind: address already in use
```

**Solution:** Change `GRPC_PORT` in `.env` or stop the conflicting process:
```bash
lsof -ti:50051 | xargs kill -9
```

### Connection refused

**Problem:** Client can't connect
```
Error: 14 UNAVAILABLE: Connection refused
```

**Solution:** Ensure server is running:
```bash
curl http://localhost:3000/health  # Check if HTTP server is up
```

### Proto file not found

**Problem:** 
```
Error: ENOENT: no such file or directory, open 'proto/logs.proto'
```

**Solution:** Check your working directory matches the proto path:
```javascript
const PROTO_PATH = path.join(__dirname, 'proto/logs.proto');
```

## Resources

- [gRPC Documentation](https://grpc.io/docs/)
- [Protocol Buffers Guide](https://protobuf.dev/)
- [grpcurl GitHub](https://github.com/fullstorydev/grpcurl)
- [@grpc/grpc-js NPM](https://www.npmjs.com/package/@grpc/grpc-js)

## Future Enhancements

Potential improvements for gRPC implementation:

- [ ] Bidirectional streaming for real-time log ingestion
- [ ] Server streaming for log tailing
- [ ] TLS/SSL encryption
- [ ] Authentication middleware (JWT, API keys)
- [ ] gRPC reflection for dynamic discovery
- [ ] Connection pooling and load balancing
- [ ] Prometheus metrics for gRPC endpoints
- [ ] Request/response compression
- [ ] Circuit breaker pattern
- [ ] Distributed tracing integration

---

**Questions or issues?** Check the main README.md or open an issue.

