const { performance, PerformanceObserver, monitorEventLoopDelay } = require('perf_hooks');
const os = require('os');
const v8 = require('v8');

/**
 * PerformanceMonitor - Captures high-precision system and application metrics
 */
class PerformanceMonitor {
    constructor(stageName) {
        this.stageName = stageName;
        this.startTime = 0;
        this.endTime = 0;

        // Metrics storage
        this.latencies = []; // Array of milliseconds
        this.metrics = {
            totalRequests: 0,
            failedRequests: 0,
            totalBytes: 0,
            cpuUsage: [],
            memoryUsage: [],
            eventLoopLag: []
        };

        // Event loop lag monitoring (resolution: 10ms)
        this.histogram = monitorEventLoopDelay({ resolution: 10 });
        this.histogram.enable();
    }

    start() {
        this.startTime = performance.now();
        this.latencies = []; // Reset latencies
        console.log(`[Monitor] Starting capture for stage: ${this.stageName}`);
    }

    stop() {
        this.endTime = performance.now();
        this.histogram.disable();
        console.log(`[Monitor] Stopped capture for stage: ${this.stageName}`);
    }

    recordRequest(latencyMs, bytes = 0, isError = false) {
        if (!isError) {
            this.latencies.push(latencyMs);
            this.metrics.totalBytes += bytes;
        } else {
            this.metrics.failedRequests++;
        }
        this.metrics.totalRequests++;
    }

    snapshotSystemMetrics() {
        const mem = process.memoryUsage();
        this.metrics.memoryUsage.push({
            rss: mem.rss / 1024 / 1024,
            heapUsed: mem.heapUsed / 1024 / 1024,
            external: mem.external / 1024 / 1024,
            timestamp: Date.now()
        });

        // Approximate CPU Load Avg
        const cpus = os.cpus();
        // Simplified: Just taking loadavg logic or checking active handles if needed
        // For now, loadavg is generic but reliable for system stress
        this.metrics.cpuUsage.push({
            loadAvg: os.loadavg(),
            timestamp: Date.now()
        });

        // Event loop lag snapshot
        this.metrics.eventLoopLag.push({
            mean: this.histogram.mean / 1e6,
            max: this.histogram.max / 1e6,
            p99: this.histogram.percentile(99) / 1e6
        });
    }

    getResults() {
        const durationSec = (this.endTime - this.startTime) / 1000;
        const sortedLatencies = Float64Array.from(this.latencies).sort();

        const getPercentile = (p) => {
            if (sortedLatencies.length === 0) return 0;
            const index = Math.floor((p / 100) * sortedLatencies.length);
            return sortedLatencies[Math.min(index, sortedLatencies.length - 1)];
        };

        const sumLatency = this.latencies.reduce((a, b) => a + b, 0);
        const avgLatency = this.latencies.length ? sumLatency / this.latencies.length : 0;

        // Aggregate Memory
        const avgMemory = this.metrics.memoryUsage.reduce((acc, m) => acc + m.heapUsed, 0) / (this.metrics.memoryUsage.length || 1);
        const maxMemory = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed), 0);

        // Aggregate Event Loop Lag
        const avgLoopLag = this.metrics.eventLoopLag.reduce((acc, m) => acc + m.mean, 0) / (this.metrics.eventLoopLag.length || 1);

        return {
            stage: this.stageName,
            duration: durationSec,
            throughput: {
                totalRequests: this.metrics.totalRequests,
                requestsPerSec: durationSec > 0 ? this.metrics.totalRequests / durationSec : 0,
                bytesPerSec: durationSec > 0 ? this.metrics.totalBytes / durationSec : 0,
                failedRequests: this.metrics.failedRequests
            },
            latency: {
                min: sortedLatencies[0] || 0,
                max: sortedLatencies[sortedLatencies.length - 1] || 0,
                avg: avgLatency,
                p50: getPercentile(50),
                p95: getPercentile(95),
                p99: getPercentile(99),
                p999: getPercentile(99.9)
            },
            system: {
                avgMemoryHeapMB: avgMemory,
                peakMemoryHeapMB: maxMemory,
                avgEventLoopLagMs: avgLoopLag
            }
        };
    }
}

module.exports = PerformanceMonitor;
