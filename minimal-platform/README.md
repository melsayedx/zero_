# Minimal Log Ingestion Platform

A **clean architecture** foundation for log ingestion. Simple, extensible, production-ready foundation.

## 🎯 Philosophy

- **Minimal but complete** - Only what you need, nothing you don't
- **Clean architecture** - Ports & Adapters (Hexagonal Architecture)
- **Easy to evolve** - Add features without breaking existing code
- **Clear boundaries** - Business logic separate from infrastructure

## 📐 Architecture

```
┌─────────────────────────────────────────────┐
│           HTTP Layer (Adapters)             │
│  ┌──────────┐         ┌─────────────┐      │
│  │ Routes   │────────▶│ Controllers │      │
│  └──────────┘         └──────┬──────┘      │
└────────────────────────────────┼────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────┐
│         Core Business Logic (Domain)        │
│  ┌──────────────┐    ┌──────────────┐      │
│  │  Use Cases   │◀───│   Entities   │      │
│  └──────┬───────┘    └──────────────┘      │
│         │                                   │
│         │ depends on (interface)            │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │    Ports     │ (interfaces only)        │
│  └──────────────┘                          │
└─────────────────────────────────────────────┘
         ▲
         │ implements
         │
┌────────┴─────────────────────────────────────┐
│      Infrastructure (Adapters)              │
│  ┌──────────────┐    ┌──────────────┐      │
│  │  ClickHouse  │    │   MongoDB    │      │
│  │  Repository  │    │  Repository  │      │
│  └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────┘
```

### Key Principles

1. **Core doesn't depend on adapters** - Business logic is pure
2. **Adapters depend on core** - Through port interfaces
3. **Easy to test** - Mock the ports, test the use cases
4. **Easy to swap** - Replace ClickHouse with PostgreSQL? Just write new adapter

## 📁 Project Structure

```
src/
├── core/                          # Business Logic (Pure)
│   ├── entities/
│   │   └── log-entry.js          # Domain object with validation
│   ├── use-cases/
│   │   └── ingest-log.use-case.js # Business logic
│   └── ports/                     # Interfaces (contracts)
│       ├── log-repository.port.js
│       └── cache.port.js
│
├── adapters/                      # External World
│   ├── http/
│   │   ├── routes.js             # URL mappings
│   │   └── controllers.js         # Request/Response handling
│   └── repositories/
│       ├── clickhouse.repository.js # Port implementation
│       └── mongodb.repository.js     # Port implementation
│
├── config/
│   ├── database.js               # DB initialization
│   └── di-container.js           # Dependency wiring
│
└── app.js                        # Application entry point
```

## 🚀 Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env if needed
```

### 3. Start Dependencies

**Using Docker:**

```bash
# ClickHouse
docker run -d -p 8123:8123 clickhouse/clickhouse-server

# MongoDB
docker run -d -p 27017:27017 mongo
```

### 4. Run

```bash
npm start
# or for development:
npm run dev
```

## 📝 Usage

### Ingest a Log

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "INFO",
    "message": "User logged in",
    "service": "auth-service",
    "metadata": {
      "userId": "123",
      "ip": "192.168.1.1"
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Log ingested successfully",
  "log": {
    "timestamp": "2024-01-01T12:00:00.000Z",
    "level": "INFO",
    "message": "User logged in",
    "service": "auth-service",
    "metadata": { "userId": "123", "ip": "192.168.1.1" }
  }
}
```

### Health Check

```bash
curl http://localhost:3000/health
```

## 🧪 Testing the Architecture

The clean architecture makes testing easy:

```javascript
// Mock the repository (port)
const mockRepository = {
  save: jest.fn()
};

// Test use case in isolation
const useCase = new IngestLogUseCase(mockRepository);
const result = await useCase.execute({
  level: 'INFO',
  message: 'test',
  service: 'test'
});

expect(mockRepository.save).toHaveBeenCalled();
```

## 🔄 Evolution Path

This minimal setup is designed to grow. Here's how to add features:

### Phase 2: Add Batching

1. Create new use case: `batch-ingest.use-case.js`
2. Add method to port: `saveBatch(logs)`
3. Implement in repository
4. Add new route
5. **Core business logic unchanged** ✅

### Phase 3: Add Caching

1. Implement `cache.port.js` (Redis adapter)
2. Inject into use case
3. Use in repository
4. **No changes to controllers or routes** ✅

### Phase 4: Add Authentication

1. Create middleware in `adapters/http/middleware/`
2. Add to routes
3. **Core use cases unchanged** ✅

### Phase 5: Add Querying

1. New use case: `query-logs.use-case.js`
2. Use existing `find()` port method
3. New controller + routes
4. **Reuse repository** ✅

## 🎨 Why This Architecture?

### ❌ Traditional Layered Architecture Problem

```javascript
// Controller depends on database directly
class LogController {
  async create(req, res) {
    await clickhouse.insert(...); // ❌ Coupled to ClickHouse
  }
}
```

**Issues:**
- Can't test without database
- Can't swap databases easily
- Business logic mixed with infrastructure
- Hard to maintain

### ✅ Ports & Adapters Solution

```javascript
// Use case depends on interface (port)
class IngestLogUseCase {
  constructor(logRepository) { // ✅ Any implementation
    this.logRepository = logRepository;
  }
  
  async execute(data) {
    await this.logRepository.save(log); // ✅ Clean
  }
}
```

**Benefits:**
- Easy to test (mock the port)
- Easy to swap implementations
- Business logic is pure
- Maintainable and scalable

## 📊 What You Get

- ✅ **One endpoint** that works
- ✅ **Clean separation** of concerns
- ✅ **Foundation** to build on
- ✅ **60 lines** of core business logic
- ✅ **Testable** architecture
- ✅ **Production-ready** structure

## 🔧 Current Limitations (By Design)

These are intentionally **not included** in Phase 1:

- ❌ No batch processing (add in Phase 2)
- ❌ No caching (add in Phase 3)
- ❌ No authentication (add in Phase 4)
- ❌ No query endpoint (add in Phase 5)
- ❌ No rate limiting
- ❌ No compression

**Why?** Start simple, add complexity only when needed.

## 💡 Key Takeaways

1. **Core is pure** - No Express, no database imports in `core/`
2. **Ports are interfaces** - Define contracts, not implementations
3. **Adapters implement ports** - Infrastructure concerns live here
4. **DI wires everything** - One place to see all dependencies
5. **Easy to extend** - Add features without breaking existing code

## 📚 Next Steps

1. ✅ Get it running
2. ✅ Understand the architecture
3. 📖 Read the code (it's documented)
4. 🧪 Try swapping repositories (great exercise!)
5. 🚀 Start adding features you need

## 🤝 Philosophy

> "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry

This platform embodies that principle. Every line serves a purpose. Every abstraction justifies its existence.

---

**Built with ❤️ for clean architecture**

