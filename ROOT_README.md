# Log Ingestion Platform - Two Approaches

This repository demonstrates **two different approaches** to building a log ingestion platform with Express.js and ClickHouse.

## 🎯 Choose Your Path

### 1. Full Feature Platform 🚀

**Location:** `/` (root directory)

A complete, production-ready log ingestion platform with all features:

- ✅ Batch processing (50K+ logs/sec)
- ✅ Query API with filtering & aggregation
- ✅ Dashboard management
- ✅ Schema registry
- ✅ Redis caching
- ✅ Authentication (JWT & API keys)
- ✅ Performance monitoring
- ✅ 70+ files, 5000+ lines

**Best for:**
- Production deployments
- Teams needing immediate functionality
- Feature-complete systems
- Learning Express.js patterns

📖 [**Go to Full Platform →**](./README.md)

---

### 2. Minimal Clean Architecture 🎨

**Location:** `/minimal-platform/`

A minimal but properly architected foundation using Ports & Adapters:

- ✅ One use case (ingest logs)
- ✅ Clean architecture (Hexagonal)
- ✅ 14 files, 400 lines
- ✅ Easy to understand every line
- ✅ Perfect foundation to evolve
- ✅ Testable without databases

**Best for:**
- Learning clean architecture
- Building custom solutions
- Understanding design patterns
- Starting simple, adding complexity only when needed

📖 [**Go to Minimal Platform →**](./minimal-platform/README.md)

---

## 🤔 Which Should You Choose?

| Question | Answer | Platform |
|----------|--------|----------|
| Need production-ready system NOW? | Yes | → Full |
| Learning architecture patterns? | Yes | → Minimal |
| Want all features included? | Yes | → Full |
| Want to build features yourself? | Yes | → Minimal |
| Working with a team? | Yes | → Full |
| Solo developer/learner? | Either | → Your choice |
| Need 50K+ logs/sec immediately? | Yes | → Full |
| Starting small, scaling later? | Yes | → Minimal |

## 📊 Quick Comparison

| Aspect | Full | Minimal |
|--------|------|---------|
| Files | 70+ | 14 |
| Lines of Code | ~5,000 | ~400 |
| Dependencies | 24 | 4 |
| Setup Time | 10 min | 2 min |
| Features | Everything | Foundation |
| Architecture | Layered | Hexagonal |
| Throughput | 50K logs/sec | 1K logs/sec* |
| Learning Curve | Moderate | Easy |

\* Add batching to reach 50K+ logs/sec

## 🎓 Learning Paths

### Path A: Ship Fast
1. Start with **Full Platform**
2. Deploy to production
3. Learn by reading working code
4. Extend with new features

### Path B: Learn Deep
1. Start with **Minimal Platform**
2. Understand every line
3. Add features one by one
4. Master clean architecture

### Path C: Best of Both
1. Read **Minimal Platform** first (2 hours)
2. Understand the patterns
3. Use **Full Platform** for production
4. Apply clean architecture principles

## 📁 Repository Structure

```
log-ingestion-platform/
│
├── / (root)              # Full Platform
│   ├── src/              #   70+ files
│   ├── tests/
│   ├── scripts/
│   ├── docker/
│   └── README.md         # ← Full platform docs
│
├── minimal-platform/     # Minimal Platform
│   ├── src/              #   10 core files
│   │   ├── core/         #   Business logic (pure)
│   │   ├── adapters/     #   Infrastructure
│   │   └── config/       #   Setup
│   └── README.md         # ← Minimal platform docs
│
└── COMPARISON.md         # ← Detailed comparison
```

## 🚀 Quick Start

### Try Full Platform

```bash
# Install
npm install

# Start databases
cd docker && docker-compose up -d && cd ..

# Setup
npm run setup:clickhouse
npm run setup:mongodb

# Run
npm run dev
```

### Try Minimal Platform

```bash
# Navigate
cd minimal-platform

# Install
npm install

# Start databases
docker-compose up -d

# Run
npm start
```

## 💡 Key Differences

### Full Platform
- **Philosophy:** "Batteries included"
- **Architecture:** Traditional layered (MVC-inspired)
- **Dependencies:** Everything you need
- **Learning:** Learn by using
- **Time to production:** Immediate

### Minimal Platform
- **Philosophy:** "Foundation to build on"
- **Architecture:** Ports & Adapters (Hexagonal)
- **Dependencies:** Only essentials
- **Learning:** Learn by building
- **Time to production:** Add features as needed

## 🎯 Use Cases

### Use Full Platform When:
- Deploying to production immediately
- Need comprehensive monitoring
- Want authentication built-in
- Team familiar with Express patterns
- Need high throughput out of the box

### Use Minimal Platform When:
- Learning clean architecture
- Building custom features
- Want complete understanding
- Prefer minimal dependencies
- Value simplicity over completeness

## 📚 Documentation

- [Full Platform README](./README.md)
- [Full Platform API Examples](./API_EXAMPLES.md)
- [Minimal Platform README](./minimal-platform/README.md)
- [Detailed Comparison](./COMPARISON.md)

## 🎨 Architecture Comparison

### Full Platform: Layered
```
HTTP → Middleware → Services → Repositories → DB
```
Traditional, proven, fast to build.

### Minimal Platform: Hexagonal
```
HTTP → Controllers → Use Cases ← Ports → Adapters → DB
```
Clean boundaries, easy to test, flexible.

## 🧪 Testing

### Full Platform
```javascript
// Integration tests with all services
describe('Log Ingestion', () => {
  it('should ingest and query logs', async () => {
    await request(app).post('/api/v1/ingest')...
  });
});
```

### Minimal Platform
```javascript
// Unit tests without database
const mockRepo = { save: jest.fn() };
const useCase = new IngestLogUseCase(mockRepo);
await useCase.execute(logData);
expect(mockRepo.save).toHaveBeenCalled();
```

Try it:
```bash
cd minimal-platform
node test-example.js  # No database needed!
```

## 🤝 Both Platforms

- ✅ Production-ready code quality
- ✅ Well-documented
- ✅ Use ClickHouse for logs
- ✅ Use MongoDB for metadata
- ✅ Docker support
- ✅ Express.js based
- ✅ Proper error handling
- ✅ Environment configuration

## 🌟 Recommendations

**For Startups/Production:**
→ Use **Full Platform** - Ship faster

**For Learning/Personal Projects:**
→ Use **Minimal Platform** - Understand deeper

**For Growing Companies:**
→ Start **Minimal**, steal patterns from **Full**

**For Teaching:**
→ Teach with **Minimal**, reference **Full**

## 📖 Next Steps

1. **Read** both READMEs (10 minutes)
2. **Read** [COMPARISON.md](./COMPARISON.md) (15 minutes)
3. **Choose** your approach
4. **Run** the quick start
5. **Build** something awesome!

## 🎓 What You'll Learn

### From Full Platform:
- Express.js best practices
- Service-oriented architecture
- MongoDB & ClickHouse integration
- Production monitoring patterns
- Batch processing strategies

### From Minimal Platform:
- Clean architecture principles
- Dependency inversion
- Ports & Adapters pattern
- Domain-driven design basics
- Testing without mocks

### From Both:
- Different valid approaches
- Trade-offs in architecture
- When to choose simplicity vs features
- How to evolve a codebase

---

## 🎉 Get Started!

Choose your adventure:

**→ [Full Platform](./README.md)** - Let's ship to production  
**→ [Minimal Platform](./minimal-platform/README.md)** - Let's build it right  
**→ [Comparison](./COMPARISON.md)** - Let's understand the trade-offs

---

**Both platforms built with ❤️ to demonstrate different approaches to the same problem**

*No single "best" architecture - only trade-offs that match your context*

