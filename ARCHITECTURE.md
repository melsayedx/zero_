# Architecture Documentation

## Onion Architecture

This application follows the **Onion Architecture** pattern, which promotes strict separation of concerns through concentric layers with dependencies always pointing inward toward the core domain.

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                      LAYER 4: INFRASTRUCTURE                       │
│                    (Frameworks & External Systems)                 │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Database   │  │   Workers    │  │ Persistence  │             │
│  │  Connections │  │   & Cluster  │  │ Repositories │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
├────────────────────────────────────────────────────────────────────┤
│                      LAYER 3: INTERFACES                           │
│                    (Adapters & Gateways)                           │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │  HTTP/gRPC      │  │   Middleware    │  │   Parsers       │    │
│  │  Controllers    │  │                 │  │                 │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
├────────────────────────────────────────────────────────────────────┤
│                      LAYER 2: APPLICATION                          │
│                    (Use Cases & Orchestration)                     │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │                    Use Cases                             │      │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐    │      │
│  │  │ IngestLog   │ │ GetLogs     │ │ Auth/App UseCases│   │      │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘    │      │
│  │                                                          │      │
│  │                 Application Services                     │      │
│  │  ┌─────────────────────────────────────────────────┐    │      │
│  │  │          LogIngestionService                     │    │      │
│  │  └─────────────────────────────────────────────────┘    │      │
│  └─────────────────────────────────────────────────────────┘      │
├────────────────────────────────────────────────────────────────────┤
│                      LAYER 1: DOMAIN                               │
│                    (Core Business Rules)                           │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │   Entities      │   Value Objects    │   Contracts      │      │
│  │  ┌──────────┐   │  ┌─────────────┐  │  ┌────────────┐  │      │
│  │  │ LogEntry │   │  │ LogLevel    │  │  │ LogRepo    │  │      │
│  │  │ User     │   │  │ AppId       │  │  │ UserRepo   │  │      │
│  │  │ App      │   │  │ Metadata    │  │  │ AppRepo    │  │      │
│  │  └──────────┘   │  │ TraceId     │  │  │ IngestLog  │  │      │
│  │                 │  └─────────────┘  │  └────────────┘  │      │
│  └─────────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

## Dependency Direction

The key principle of Onion Architecture is that **dependencies always point inward**:

```
Infrastructure → Interfaces → Application → Domain
      ↓              ↓            ↓           ↓
   (Layer 4)     (Layer 3)    (Layer 2)   (Layer 1)

Dependencies flow: INWARD ONLY (toward the center)
```

### Benefits:
1. ✅ **Domain is completely isolated** - No dependencies on frameworks or infrastructure
2. ✅ **Testable** - Each layer can be tested independently with mocks
3. ✅ **Flexible** - Swap implementations without changing business logic
4. ✅ **Maintainable** - Clear separation of concerns with enforced boundaries

## Layers Explained

### Layer 1: Domain (innermost)
- **Entities**: Core business objects with behavior (`LogEntry`, `User`, `App`)
- **Value Objects**: Immutable objects representing values (`LogLevel`, `AppId`, `Metadata`, `TraceId`)
- **Contracts**: Interfaces defining what the domain needs (not how it's implemented)
- **No external dependencies** - Pure JavaScript business logic

### Layer 2: Application
- **Use Cases**: Application-specific business rules (`IngestLogUseCase`, `GetLogsByAppIdUseCase`)
- **Application Services**: Orchestration and cross-cutting concerns (`LogIngestionService`)
- **Depends on**: Domain layer contracts only
- **Does not know about**: HTTP, databases, or any infrastructure

### Layer 3: Interfaces (Adapters)
- **HTTP Controllers**: Handle HTTP requests and responses
- **gRPC Handlers**: Handle gRPC service methods
- **Middleware**: Request processing, authentication, parsing
- **Parsers**: Protocol buffer and format parsers
- **Depends on**: Application and Domain layers

### Layer 4: Infrastructure (outermost)
- **Database Connections**: ClickHouse, MongoDB, Redis clients
- **Persistence Repositories**: Implement domain contracts (`ClickHouseRepository`, `RedisLogRepository`)
- **Workers**: Background job processors
- **Cluster Management**: Process clustering and worker threads
- **Buffers**: Batch buffer, buffer pool optimizations
- **Retry Strategies**: Error handling and retry mechanisms
- **Configuration**: DI container, environment configuration

## Code Organization

```
src/
├── domain/                     # Layer 1: Domain (innermost - no dependencies)
│   ├── entities/              # Business objects
│   │   ├── log-entry.js
│   │   ├── user.entity.js
│   │   └── app.entity.js
│   ├── value-objects/         # Immutable value types
│   │   ├── app-id.js
│   │   ├── log-level.js
│   │   ├── metadata.js
│   │   └── trace-id.js
│   └── contracts/             # Interfaces (what domain needs)
│       ├── ingest-log.contract.js
│       ├── log-repository.contract.js
│       ├── user-repository.contract.js
│       ├── app-repository.contract.js
│       └── retry-strategy.contract.js
│
├── application/               # Layer 2: Application (depends on domain only)
│   ├── use-cases/            # Business workflows
│   │   ├── logs/
│   │   │   ├── ingest-log.use-case.js
│   │   │   ├── get-logs-by-app-id.use-case.js
│   │   │   ├── ingest-result.js
│   │   │   └── query-result.js
│   │   ├── auth/
│   │   │   ├── login-user.use-case.js
│   │   │   └── register-user.use-case.js
│   │   └── apps/
│   │       ├── create-app.use-case.js
│   │       ├── list-user-apps.use-case.js
│   │       └── verify-app-access.use-case.js
│   └── services/             # Application services (orchestration)
│       └── log-ingest.service.js
│
├── interfaces/               # Layer 3: Interface Adapters
│   ├── http/                 # HTTP controllers
│   │   ├── controllers.js
│   │   ├── auth.controllers.js
│   │   ├── app.controllers.js
│   │   └── routes.js
│   ├── grpc/                 # gRPC handlers
│   │   ├── handlers.js
│   │   └── server.js
│   ├── middleware/           # Request processing
│   │   ├── auth.middleware.js
│   │   ├── content-parser.middleware.js
│   │   └── request-coalescer.js
│   └── parser/               # Format parsers
│       └── protobuf-parser.js
│
└── infrastructure/           # Layer 4: Infrastructure (outermost)
    ├── persistence/          # Repository implementations
    │   ├── clickhouse.repository.js
    │   └── redis-log.repository.js
    ├── database/             # Database connections
    │   ├── clickhouse.js
    │   ├── mongodb.js
    │   └── redis.js
    ├── workers/              # Background job processors
    │   ├── validation-service.js
    │   ├── validation-worker.js
    │   ├── log-processor.worker.js
    │   └── worker-pool.js
    ├── cluster/              # Process management
    │   ├── cluster-manager.js
    │   └── cluster-worker.js
    ├── buffers/              # Batching & buffering
    │   ├── batch-buffer.js
    │   └── buffer-utils.js
    ├── retry-strategies/     # Error recovery
    │   ├── redis-retry-strategy.js
    │   └── in-memory-retry-strategy.js
    ├── http2/                # HTTP/2 server
    │   └── server.js
    ├── http3/                # HTTP/3 server
    │   └── server.js
    └── config/               # Configuration & DI
        └── di-container.js
```

## Example Flow: Ingesting a Log

```
1. HTTP Request arrives
   │
   ▼
2. Interface Layer: HTTP Controller (interfaces/http/)
   │ - Validates HTTP request format
   │ - Calls application use case
   │
   ▼
3. Application Layer: IngestLogUseCase (application/use-cases/)
   │ - Orchestrates business workflow
   │ - Creates domain entities
   │ - Calls repository through contract
   │
   ▼
4. Domain Layer: LogEntry Entity (domain/entities/)
   │ - Validates business rules
   │ - Creates value objects
   │ - Pure domain logic
   │
   ▼
5. Infrastructure Layer: Repository Implementation (infrastructure/persistence/)
   │ - Implements domain contract
   │ - Translates to storage format
   │
   ▼
6. Infrastructure Layer: Database (infrastructure/database/)
   │ - Handles actual persistence
   │ - Connection management
   │
   ▼
7. Response flows back up the chain
```

## Key Principles Applied

### 1. Dependency Inversion Principle (DIP)
- High-level modules (domain, application) don't depend on low-level modules (infrastructure)
- Both depend on abstractions (contracts/interfaces)

### 2. Single Responsibility Principle (SRP)
- Controllers: Handle HTTP/gRPC concerns only
- Use Cases: Handle business workflow only
- Repositories: Handle data persistence only
- Entities: Represent domain models with business rules

### 3. Open/Closed Principle (OCP)
- Can add new repositories (e.g., PostgreSQL) without modifying domain
- Can add new controllers (e.g., GraphQL) without modifying use cases

### 4. Interface Segregation Principle (ISP)
- Contracts are specific to what each consumer needs
- No "fat" interfaces with unused methods

## Testing Strategy

```
Unit Tests:
├── Domain Layer:
│   ├── Entities: Test validation logic in isolation
│   └── Value Objects: Test immutability and constraints
├── Application Layer:
│   └── Use Cases: Test with mocked contract implementations
└── Interface Layer:
    ├── Controllers: Test request/response handling
    └── Repositories: Test with real/test infrastructure

Integration Tests:
└── Test complete flows through all layers
```

## Adding New Features

### Adding a new use case:
1. Define contract interface in `domain/contracts/` (if new dependency needed)
2. Create use case in `application/use-cases/`
3. Use existing domain entities or create new ones
4. Create controller in `interfaces/http/` or `interfaces/grpc/`
5. Wire up in DI container

### Adding a new data source:
1. Use existing contract or create new one in `domain/contracts/`
2. Create repository implementation in `infrastructure/persistence/`
3. Add infrastructure setup in `infrastructure/database/`
4. Wire up in DI container
5. No changes needed in domain or application layers!

## JavaScript vs TypeScript for Contracts

### Current Implementation (JavaScript)
```javascript
// Contract (base class)
class LogRepositoryContract {
  async save(logEntries) {
    throw new Error('Method not implemented: save()');
  }
}

// Implementation (extends)
class ClickHouseRepository extends LogRepositoryContract {
  async save(logEntries) {
    // actual implementation
  }
}
```

**Pros:**
- ✅ Works in plain JavaScript
- ✅ Shows architectural intent
- ✅ Provides base method definitions
- ✅ Runtime error if method not implemented

**Cons:**
- ❌ No compile-time checking
- ❌ Can forget to extend contract
- ❌ Runtime errors only

### With TypeScript (recommended for scaling)
```typescript
// Contract (interface)
interface LogRepositoryContract {
  save(logEntries: LogEntry[]): Promise<Result>;
}

// Implementation (implements)
class ClickHouseRepository implements LogRepositoryContract {
  async save(logEntries: LogEntry[]): Promise<Result> {
    // TypeScript enforces this method exists!
  }
}
```

**When to upgrade to TypeScript?**
- Multiple teams working on codebase
- Large codebase (100+ files)
- Need strict contract enforcement
- Want better IDE support

## References

- [The Onion Architecture by Jeffrey Palermo](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design by Eric Evans](https://domainlanguage.com/ddd/)
