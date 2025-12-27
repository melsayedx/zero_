# Performance Benchmark Results

**Date:** 2025-12-27T16:42:44.365Z

## Throughput & Latency Comparison

| Stage | Throughput (req/s) | Avg Latency (ms) | P99 Latency (ms) | Improvement (Throughput) |
|-------|-------------------:|-----------------:|-----------------:|-------------------------:|
| **01-baseline-sync-insert** | 116.41 | 8.59 | 12.95 | 1.0x (Baseline) |
| **02-fire-and-forget** | 953.14 | 0.05 | 0.13 | **8.2x** 🚀 |
| **03-coalescing-plus-fire-and-forget** | 2,465.15 | 19.52 | 23.67 | **21.2x** 🚀 |
| **04-full-pipeline** | 17,920.09 | 135.96 | 137.19 | **153.9x** 🚀 |
| **05-full-pipeline-with-workers** | 34,040.14 | 141.12 | 142.7 | **292.4x** 🚀 |

## Stage Explanations

| Stage | What It Tests | Key Optimization |
|-------|---------------|------------------|
| 01-baseline | Synchronous ClickHouse inserts | None (baseline) |
| 02-fire-and-forget | Async ClickHouse (no wait) | `async_insert=1`, no confirmation wait |
| 03-coalescing | Batching + async ClickHouse | RequestManager batches requests |
| 04-redis-streams | Redis as buffer layer | Redis Stream (XADD) replaces direct ClickHouse |
| 05-worker-threads | Separate consumer threads | Main thread freed, workers process Redis→ClickHouse |

## Why Stage 03 → 04 Shows Large Improvement

The jump from Stage 03 to 04 is legitimate because:

1. **Redis is faster than ClickHouse** - Even with `async_insert`, ClickHouse HTTP calls have network overhead
2. **Redis uses pipelining** - Multiple XADD commands in a single round-trip
3. **Decoupled write path** - Producer only waits for Redis, not database

## Production Caveats

> **Important:** These benchmarks run locally with no network latency, no disk I/O contention, and a single client.

**Expect in production:**
- 50-70% lower throughput due to network latency
- Higher latency variance under concurrent load
- Redis becomes bottleneck at ~100K+ ops/sec without clustering
- ClickHouse async_insert buffer limits may cause backpressure

**What the metrics measure:**
- **Throughput**: Requests processed per second by the producer (client response time)
- **Latency**: Time from request start until Redis/ClickHouse write confirmed
- **Not measured**: End-to-end time to ClickHouse (Stages 04-05 use async workers)

## System Resources

| Stage | Heap Usage (MB) | Event Loop Lag (ms) |
|-------|----------------:|--------------------:|
| 01-baseline-sync-insert | 18.48 | 10.14 |
| 02-fire-and-forget | 90.39 | N/A |
| 03-coalescing-plus-fire-and-forget | 11.21 | 10.37 |
| 04-full-pipeline | 21.14 | 23.41 |
| 05-full-pipeline-with-workers | 29.7 | 10.67 |

## Summary

```json
{
  "bestPerformingStage": "05-full-pipeline-with-workers",
  "maxThroughput": 34040.14054220903,
  "lowestLatencyP99": 142.69915100000003
}
```
