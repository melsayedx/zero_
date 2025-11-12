# Performance Testing Guide

## Overview

This guide explains how to use `run.sh` for performance testing the log ingestion platform using **oha** (a modern HTTP load testing tool written in Rust).

## Prerequisites

### 1. Install oha

**macOS:**
```bash
brew install oha
```

**Linux (with Cargo):**
```bash
cargo install oha
```

**Other platforms:**
See https://github.com/hatoo/oha

### 2. Start the Server

```bash
npm start
```

The server should be running at `http://localhost:3000`

## Quick Start

### Run Interactive Menu

```bash
./run.sh
```

This will show you a menu with all available test options.

### Run Specific Test

```bash
./run.sh 1   # Health check only
./run.sh 2   # Light load (1k requests)
./run.sh 3   # Medium load (10k requests)
./run.sh 9   # Quick test suite
./run.sh 10  # All tests
```

## Test Scenarios

### 1. Health Check Test
- **Purpose**: Test basic server responsiveness
- **Load**: 10 seconds sustained, 100 concurrent connections
- **Good for**: Smoke testing

```bash
./run.sh 1
```

### 2. Light Load Test
- **Requests**: 1,000
- **Concurrency**: 50
- **Payload**: ~200 bytes
- **Good for**: Initial testing, CI/CD validation

```bash
./run.sh 2
```

### 3. Medium Load Test
- **Requests**: 10,000
- **Concurrency**: 100
- **Payload**: ~350 bytes (realistic log entry)
- **Good for**: Standard performance baseline

```bash
./run.sh 3
```

### 4. Heavy Load Test
- **Requests**: 100,000
- **Concurrency**: 200
- **Payload**: ~450 bytes (complex log with metadata)
- **Good for**: Stress testing, capacity planning

```bash
./run.sh 4
```

### 5. Duration-Based Test
- **Duration**: 30 seconds sustained load
- **Concurrency**: 100
- **Good for**: Measuring sustained throughput

```bash
./run.sh 5
```

### 6. Burst Load Test
- **Requests**: 5,000
- **Concurrency**: 500 (high!)
- **Good for**: Simulating traffic spikes

```bash
./run.sh 6
```

### 7. Query Performance Test
- **Type**: Read operations (GET requests)
- **Endpoint**: `/api/logs/:app_id?limit=100`
- **Requests**: 1,000
- **Concurrency**: 50
- **Good for**: Testing read performance

```bash
./run.sh 7
```

### 8. Large Payload Test
- **Payload**: ~1.5KB (analytics event with extensive metadata)
- **Requests**: 5,000
- **Concurrency**: 100
- **Good for**: Testing with realistic large payloads

```bash
./run.sh 8
```

## Test Suites

### Quick Test Suite (Option 9)
Runs:
1. Health check
2. Light load test
3. Query performance test

**Time**: ~1-2 minutes  
**Good for**: Quick validation after changes

```bash
./run.sh 9
```

### All Tests (Option 10)
Runs all tests except heavy load (asks for confirmation).

**Time**: ~5-10 minutes  
**Good for**: Comprehensive performance analysis

```bash
./run.sh 10
```

### Stress Tests (Option 11)
Runs heavy load scenarios:
- Burst load
- Duration-based
- Heavy load (100k requests)

**Time**: ~5 minutes  
**Good for**: Finding performance limits

```bash
./run.sh 11
```

## Understanding Results

### Key Metrics

**Success Rate:**
- Target: 100%
- Below 99.9% indicates errors under load

**Requests/sec (throughput):**
- Light load: 500-1000 req/sec = Good
- Medium load: 1000-5000 req/sec = Excellent
- Heavy load: 5000+ req/sec = Outstanding

**Latency (p50, p95, p99):**
- p50 < 50ms = Excellent
- p95 < 200ms = Good
- p99 < 500ms = Acceptable
- p99 > 1s = Needs optimization

### Sample Output

```
Summary:
  Success rate: 100.00%
  Total:        2.5678 secs
  Slowest:      0.1234 secs
  Fastest:      0.0023 secs
  Average:      0.0145 secs
  Requests/sec: 3895.67

Response time histogram:
  0.002 [1]     |
  0.015 [8234]  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  0.028 [1234]  |■■■■
  ...

Latency distribution:
  10% in 0.0089 secs
  25% in 0.0112 secs
  50% in 0.0134 secs
  75% in 0.0167 secs
  90% in 0.0234 secs
  95% in 0.0289 secs
  99% in 0.0456 secs
```

## Results Storage

All test results are automatically saved to:

```
./performance-results/test_YYYYMMDD_HHMMSS.txt
```

Example: `./performance-results/test_20251112_143052.txt`

## Tips

### 1. Warmup
Run a quick test first to warm up the server:
```bash
./run.sh 1  # Health check warmup
```

### 2. Monitor Resources
During tests, monitor:
```bash
# CPU and Memory
htop

# Network
netstat -an | grep :3000

# ClickHouse
docker stats
```

### 3. Baseline Testing
Before making changes:
```bash
./run.sh 9 > baseline.txt
```

After changes:
```bash
./run.sh 9 > after_changes.txt
diff baseline.txt after_changes.txt
```

### 4. Adjust for Your Environment
Edit `run.sh` to change:
- `LIGHT_LOAD`, `MEDIUM_LOAD`, `HEAVY_LOAD` values
- Concurrency levels
- Test durations
- Payload structures

## Custom Server URL

```bash
SERVER_URL=http://192.168.1.100:3000 ./run.sh
```

## Troubleshooting

### "oha not found"
Install oha: `brew install oha` (macOS) or `cargo install oha`

### "Server not running"
Start the server: `npm start`

### Connection refused
Check firewall and ensure server is listening on correct port

### Too many open files
Increase limits:
```bash
ulimit -n 10000
```

### High latency
- Check ClickHouse performance
- Increase `async_insert` buffer sizes
- Check network latency
- Monitor CPU/memory usage

## Comparison with Node.js Tests

| Feature | oha (run.sh) | Node.js (performance-test.js) |
|---------|--------------|-------------------------------|
| Speed | ⚡ Very Fast (Rust) | Fast (Node.js) |
| Ease of Use | ✅ Simple CLI | 🔧 Requires Node |
| Histograms | ✅ Built-in | ❌ Custom code |
| Flexibility | 🔧 Command-line options | ✅ Full programming |
| Batch Support | ❌ Single requests | ✅ Batch ingestion |
| Use Case | HTTP load testing | Complex scenarios |

Use **oha** for:
- Quick performance checks
- HTTP endpoint testing
- Standard load testing

Use **Node.js tests** for:
- Batch ingestion testing
- Complex test scenarios
- Custom validation logic

## Example Workflow

```bash
# 1. Start server
npm start

# 2. Quick validation
./run.sh 9

# 3. Establish baseline
./run.sh 3 > baseline_medium.txt

# 4. Make changes to code
# ... edit files ...

# 5. Test again
./run.sh 3 > after_changes.txt

# 6. Compare results
diff baseline_medium.txt after_changes.txt

# 7. Run stress test
./run.sh 11

# 8. Review saved results
cat performance-results/test_*.txt
```

## Performance Goals

### Target Performance (Single Requests)

| Test | Target Throughput | Target p99 Latency |
|------|-------------------|-------------------|
| Light (1k) | 1,000+ req/sec | < 100ms |
| Medium (10k) | 2,000+ req/sec | < 200ms |
| Heavy (100k) | 5,000+ req/sec | < 500ms |

### Current Expected Performance

With ClickHouse async inserts enabled:
- **Throughput**: 3,000-10,000 req/sec
- **p50 Latency**: 10-50ms
- **p99 Latency**: 100-300ms
- **Success Rate**: 100%

## Next Steps

1. Run baseline tests: `./run.sh 10`
2. Review results in `performance-results/`
3. Optimize based on bottlenecks
4. Re-run and compare
5. Document your findings

Happy testing! 🚀

