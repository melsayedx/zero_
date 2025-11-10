# Architecture Documentation

## Hexagonal Architecture (Ports and Adapters)

This application follows the **Hexagonal Architecture** pattern (also known as Ports and Adapters), which promotes separation of concerns and dependency inversion.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     PRIMARY/DRIVING SIDE                         │
│                   (External → Core)                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐            ┌─────────────────┐               │
│  │   Controller   │  depends   │ IngestLogPort   │               │
│  │   (Primary     │───────────>│  (Input Port)   │               │
│  │    Adapter)    │     on     │  [Interface]    │               │
│  └────────────────┘            └─────────────────┘               │
│         │                              ▲                         │
│         │                              │                         │
│         │ calls                        │ implements              │
│         │                              │                         │
│         ▼                              │                         │
│  ┌────────────────────────────────────────────────┐              │
│  │        CORE / APPLICATION LAYER                │              │
│  │                                                │              │
│  │   ┌──────────────────────────┐                 │              │
│  │   │   IngestLogUseCase       │                 │              │
│  │   │   (Application Service)  │                 │              │
│  │   │   • Business Logic       │                 │              │
│  │   │   • Orchestration        │                 │              │
│  │   └──────────────────────────┘                 │              │
│  │              │                                 │              │
│  │              │ depends on                      │              │
│  │              ▼                                 │              │
│  │   ┌──────────────────────────┐                 │              │
│  │   │  LogRepositoryPort       │                 │              │
│  │   │   (Output Port)          │                 │              │
│  │   │   [Interface]            │                 │              │
│  │   └──────────────────────────┘                 │              │
│  │              ▲                                 │              │
│  └──────────────│─────────────────────────────────┘              │
│                 │                                                │
│                 │ implements                                     │
│                 │                                                │
├─────────────────┼────────────────────────────────────────────────┤
│                 │      SECONDARY/DRIVEN SIDE                     │
│                 │        (Core → External)                       │
│                 │                                                │
│         ┌───────────────────┐                                    │
│         │ ClickHouseRepo    │                                    │
│         │  (Secondary       │                                    │
│         │   Adapter)        │                                    │
│         └───────────────────┘                                    │
│                 │                                                │
│                 ▼                                                │
│         ┌───────────────────┐                                    │
│         │   ClickHouse DB   │                                    │
│         │   (External Dep)  │                                    │
│         └───────────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Layers Explained

### 1. **Core / Application Layer** (center of hexagon)
- **Entities**: Domain models with business rules (`LogEntry`)
- **Use Cases**: Application-specific business logic (`IngestLogUseCase extends IngestLogPort`)
- **Ports**: Interfaces defining contracts
  - **Input Ports**: Define what the application CAN DO (e.g., `IngestLogPort`)
  - **Output Ports**: Define what the application NEEDS (e.g., `LogRepositoryPort`)

### 2. **Primary Adapters** (driving side)
- **Purpose**: Initiate interactions with the application
- **Examples**: 
  - HTTP Controllers (`IngestLogController`)
  - CLI interfaces
  - Message queue consumers
- **Dependency**: Primary adapters depend on INPUT PORTS (interfaces)

### 3. **Secondary Adapters** (driven side)
- **Purpose**: Provide implementations for what the application needs
- **Examples**:
  - Database repositories (`ClickHouseRepository extends LogRepositoryPort`)
  - External API clients
  - File systems
- **Dependency**: Secondary adapters implement OUTPUT PORTS (interfaces)

### 📝 Note on JavaScript "Interfaces"
JavaScript doesn't have true interfaces (TypeScript does). We use class inheritance (`extends`) to show intent:
- `IngestLogUseCase extends IngestLogPort` - Use case implements the input port
- `ClickHouseRepository extends LogRepositoryPort` - Repository implements the output port

This provides:
- ✅ Clear architectural intent
- ✅ Base method definitions
- ✅ Documentation through code
- ❌ No compile-time enforcement (use TypeScript for that)

## Dependency Direction

The key principle is **Dependency Inversion**:

```
┌─────────────────────────────────────────────────────┐
│  ALL DEPENDENCIES POINT INWARD → TOWARD THE CORE    │
└─────────────────────────────────────────────────────┘

Controller ──→ Use Case ←── Repository
(adapter)      (core)        (adapter)
```

### Benefits:
1. ✅ **Core is isolated** - No dependencies on frameworks or infrastructure
2. ✅ **Testable** - Easy to mock ports and test use cases
3. ✅ **Flexible** - Swap implementations without changing core logic
4. ✅ **Maintainable** - Clear separation of concerns

## Code Organization

```
src/
├── core/                     # Application Core (no external dependencies)
│   ├── entities/            # Domain models
│   │   └── log-entry.js
│   ├── ports/               # Interfaces/Contracts
│   │   ├── ingest-log.port.js       (INPUT PORT)
│   │   └── log-repository.port.js   (OUTPUT PORT)
│   └── use-cases/           # Business logic
│       └── ingest-log.use-case.js
│
├── adapters/                # External world implementations
│   ├── http/                # PRIMARY ADAPTERS
│   │   ├── controllers.js
│   │   ├── routes.js
│   │   └── response-helper.js
│   └── repositories/        # SECONDARY ADAPTERS
│       └── clickhouse.repository.js
│
└── config/                  # Configuration & DI
    ├── database.js
    ├── di-container.js
    ├── http-status.js
    └── ...
```

## Example Flow: Ingesting a Log

```
1. HTTP Request
   │
   ▼
2. Controller (Primary Adapter)
   │ - Validates HTTP request
   │ - Calls use case through Input Port interface
   │
   ▼
3. Use Case (Core)
   │ - Validates business rules
   │ - Creates domain entity
   │ - Calls repository through Output Port interface
   │
   ▼
4. Repository (Secondary Adapter)
   │ - Implements persistence logic
   │ - Stores in ClickHouse
   │
   ▼
5. Response flows back up the chain
```

## Key Principles Applied

### 1. Dependency Inversion Principle (DIP)
- High-level modules (use cases) don't depend on low-level modules (repositories)
- Both depend on abstractions (ports/interfaces)

### 2. Single Responsibility Principle (SRP)
- Controllers: Handle HTTP concerns
- Use Cases: Handle business logic
- Repositories: Handle data persistence
- Entities: Represent domain models

### 3. Open/Closed Principle (OCP)
- Can add new adapters (e.g., PostgreSQL repository) without modifying core
- Can add new controllers (e.g., GraphQL) without modifying use cases

## Testing Strategy

```
Unit Tests:
├── Entities: Test validation logic in isolation
├── Use Cases: Test with mocked port implementations
└── Adapters: Test with real/test infrastructure

Integration Tests:
└── Test complete flow with real adapters
```

## Adding New Features

### Adding a new use case:
1. Create input port interface in `core/ports/`
2. Create use case in `core/use-cases/`
3. Use existing or create new output ports
4. Create adapter (controller) in `adapters/http/`
5. Wire up in DI container

### Adding a new data source:
1. Use existing output port or create new one
2. Create adapter in `adapters/repositories/`
3. Wire up in DI container
4. No changes needed in core!

## JavaScript vs TypeScript for Ports

### Current Implementation (JavaScript)
```javascript
// Port (base class)
class IngestLogPort {
  async execute(logData) {
    throw new Error('Method not implemented');
  }
}

// Implementation (extends)
class IngestLogUseCase extends IngestLogPort {
  async execute(logData) {
    // actual implementation
  }
}
```

**Pros:**
- ✅ Works in plain JavaScript
- ✅ Shows architectural intent
- ✅ Provides base implementations

**Cons:**
- ❌ No compile-time checking
- ❌ Can forget to extend port
- ❌ Runtime errors only

### With TypeScript (alternative)
```typescript
// Port (interface)
interface IngestLogPort {
  execute(logData: any): Promise<Result>;
}

// Implementation (implements)
class IngestLogUseCase implements IngestLogPort {
  async execute(logData: any): Promise<Result> {
    // TypeScript enforces this method exists!
  }
}
```

**Pros:**
- ✅ Compile-time checking
- ✅ IDE support
- ✅ Type safety
- ✅ Enforces contract

**Why JavaScript here?**
- Simple project
- No build step needed
- Ports still provide architectural documentation
- Tests catch issues

**When to upgrade to TypeScript?**
- Multiple teams
- Large codebase
- Need strict contracts
- Want better IDE support

## References

- [Hexagonal Architecture by Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Ports and Adapters Pattern](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)

