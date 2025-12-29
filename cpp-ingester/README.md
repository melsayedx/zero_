# C++ ClickHouse Native Ingester

High-performance log ingester using native ClickHouse protocol. Designed to benchmark against the Node.js worker threads implementation.

## Features

- **Native TCP Protocol** (port 9000) — No HTTP overhead
- **RowBinary Format** — Fastest binary format for ClickHouse
- **Lock-free Ring Buffer** — Zero contention between reader/writer threads
- **SIMD JSON Parsing** — Uses simdjson for 2-4x faster parsing
- **Memory Pool** — Pre-allocated buffers, zero malloc in hot path
- **Batch Pipelining** — Overlapped I/O: read next batch while writing current

## Prerequisites (macOS)

```bash
brew install cmake hiredis
```

## Build

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(sysctl -n hw.ncpu)
```

## Run

```bash
# Make sure Redis and ClickHouse are running (from project root):
# docker-compose up -d

# Run the ingester
./clickhouse_ingester --threads 4

# Benchmark mode (processes fixed count then exits)
./clickhouse_ingester --benchmark --count 50000
```

## Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `REDIS_HOST` | localhost | Redis server address |
| `REDIS_PORT` | 6379 | Redis port |
| `CLICKHOUSE_HOST` | localhost | ClickHouse server address |
| `CLICKHOUSE_NATIVE_PORT` | 9000 | ClickHouse native port |
| `STREAM_KEY` | logs:stream | Redis stream key |
| `GROUP_NAME` | log-processors | Consumer group name |
| `BATCH_SIZE` | 10000 | Logs per batch before flush |

## Cleanup

If performance doesn't justify complexity:
```bash
rm -rf cpp-ingester
```
