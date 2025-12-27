/**
 * RequestManager - Generic handler for processing requests with optional coalescing.
 *
 * This class serves as a unified entry point for request processing, offering configurable
 * batching (coalescing) capabilities. It wraps a processing function and determines whether
 * to process requests immediately or buffer them for batch processing based on configuration.
 *
 * Key features:
 * - **Generic Design**: Can wrap any request processing logic.
 * - **Configurable Coalescing**: Batch requests to improve throughput or process immediately for lowest latency.
 * - **Passthrough Mode**: When coalescing is disabled, acts as a transparent proxy.
 * - **Double-Buffer**: Uses ping-pong buffering for zero-allocation batch flushing.
 * - **Metrics**: Tracks throughput, batch sizes, and efficiency.
 *
 * @example
 * ```javascript
 * const handler = new RequestManager(
 *   async (batch) => { console.log('Processing:', batch); return batch.map(i => i); },
 *   { enabled: true, maxWaitTime: 10, maxBatchSize: 100 }
 * );
 *
 * // Add request - will be batched if enabled
 * await handler.add(myRequest);
 * ```
 */

const RequestProcessingPort = require('../../domain/contracts/request-processing.contract');

class RequestManager extends RequestProcessingPort {

    /**
     * Create a new RequestManager instance.
     *
     * @param {Function} processor - Async function that processes a batch of requests.
     *                               Must return an array of results matching the input batch length.
     * @param {Object} [options={}] - Configuration options.
     * @param {boolean} [options.enabled=true] - Whether coalescing (batching) is enabled.
     * @param {number} [options.maxWaitTime=10] - Max time (ms) to wait before flushing batch.
     * @param {number} [options.maxBatchSize=100] - Max requests per batch.
     * @param {Logger} [options.logger] - Logger instance.
     */
    constructor(processor, options = {}) {
        super();

        this.processor = processor;

        // Configuration
        this.maxWaitTime = options.maxWaitTime;
        this.maxBatchSize = options.maxBatchSize;
        this.enabled = options.enabled;
        this.logger = options.logger;

        // Double-buffer (ping-pong) pattern for coalescing
        this.bufferA = new Array(this.maxBatchSize);
        this.bufferB = new Array(this.maxBatchSize);
        this.activeBuffer = this.bufferA;
        this.pendingIndex = 0;
        this.timer = null;
        this.isFlushing = false;

        this.metrics = {
            totalRequests: 0,
            totalBatches: 0,
            totalCoalesced: 0,
            avgBatchSize: 0,
            maxBatchSeen: 0,
            bypassedRequests: 0,
            bufferSwaps: 0
        };

        this.logger.info('RequestManager initialized', {
            enabled: this.enabled,
            maxWaitTime: this.maxWaitTime,
            maxBatchSize: this.maxBatchSize
        });
    }

    /**
     * Add a request to be processed.
     *
     * If coalescing is ENABLED: Adds to buffer and waits for batch flush.
     * If coalescing is DISABLED: Processes immediately (passthrough).
     *
     * @param {*} data - The request data.
     * @returns {Promise<*>} Promise resolving to the result.
     */
    async add(data) {
        this.metrics.totalRequests++;

        // Passthrough mode: Process immediately if coalescing is disabled
        if (!this.enabled) {
            this.metrics.bypassedRequests++;
            // Wrap in array for batch processor if it's a single item
            // The processor expects an array of requests (batches)
            return this.processor([data]).then(results => results[0]);
        }

        // Coalescing mode: Add to buffer
        return new Promise((resolve, reject) => {
            this.activeBuffer[this.pendingIndex++] = { data, resolve, reject, timestamp: Date.now() };

            if (this.pendingIndex >= this.maxBatchSize) {
                this.flush();
            } else if (this.pendingIndex === 1 && !this.timer) {
                this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
            }
        });
    }

    /**
     * Process pending requests as a batch.
     */
    async flush() {
        if (this.isFlushing || this.pendingIndex === 0) {
            return;
        }

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.isFlushing = true;

        // Swap buffers
        const batchSize = this.pendingIndex;
        const batch = this.activeBuffer;
        this.activeBuffer = (batch === this.bufferA) ? this.bufferB : this.bufferA;
        this.pendingIndex = 0;
        this.metrics.bufferSwaps++;
        this.metrics.totalBatches++;

        if (batchSize > 1) {
            this.metrics.totalCoalesced += batchSize;
        }

        this.metrics.maxBatchSeen = Math.max(this.metrics.maxBatchSeen, batchSize);
        this.metrics.avgBatchSize = ((this.metrics.avgBatchSize * (this.metrics.totalBatches - 1)) + batchSize) / this.metrics.totalBatches;

        try {
            // Extract data
            const dataArray = new Array(batchSize);
            for (let i = 0; i < batchSize; i++) {
                dataArray[i] = batch[i].data;
            }

            this.logger.debug('Processing batch', { batchSize });

            // Process batch
            const results = await this.processor(dataArray);

            // Distribute results
            for (let i = 0; i < batchSize; i++) {
                const result = results[i];
                if (result && typeof result === 'object' && result.error) {
                    batch[i].reject(new Error(result.error));
                } else if (result && typeof result === 'object' && result.success === false) {
                    batch[i].reject(new Error(result.message || 'Processing failed'));
                } else {
                    batch[i].resolve(result);
                }
            }
        } catch (error) {
            this.logger.error('Batch processing error', { error });

            for (let i = 0; i < batchSize; i++) {
                batch[i].reject(error);
            }
        } finally {
            this.isFlushing = false;
            if (this.pendingIndex > 0 && !this.timer) {
                this.timer = setTimeout(() => this.flush(), this.maxWaitTime);
            }
        }
    }

    /**
     * Force flush pending requests (e.g. for shutdown).
     */
    async forceFlush() {
        if (this.pendingIndex > 0) {
            await this.flush();
        }
    }

    /**
     * Get operational statistics.
     */
    getStats() {
        const coalescingRate = this.metrics.totalRequests > 0
            ? ((this.metrics.totalCoalesced / this.metrics.totalRequests) * 100).toFixed(2)
            : 0;

        return {
            enabled: this.enabled,
            totalRequests: this.metrics.totalRequests,
            totalBatches: this.metrics.totalBatches,
            totalCoalesced: this.metrics.totalCoalesced,
            coalescingRate: `${coalescingRate}%`,
            avgBatchSize: this.metrics.avgBatchSize.toFixed(2),
            maxBatchSeen: this.metrics.maxBatchSeen,
            bypassedRequests: this.metrics.bypassedRequests,
            currentPending: this.pendingIndex
        };
    }

    /**
     * Enable or disable coalescing at runtime.
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.logger.info(enabled ? 'Coalescing enabled' : 'Coalescing disabled');
        if (!enabled && this.pendingIndex > 0) {
            this.flush();
        }
    }

    /**
     * Update configuration at runtime.
     */
    updateConfig(config) {
        if (config.maxWaitTime !== undefined) this.maxWaitTime = config.maxWaitTime;
        if (config.maxBatchSize !== undefined) this.maxBatchSize = config.maxBatchSize;
        this.logger.info('Config updated', { maxWaitTime: this.maxWaitTime, maxBatchSize: this.maxBatchSize });
    }
    /**
     * Graceful shutdown.
     * Stops accepting new requests and flushes remaining buffer.
     */
    async shutdown(timeoutMs = 5000) {
        this.logger.info('RequestManager shutting down...');

        // Disable new requests
        this.enabled = false;

        // Force flush any pending items
        if (this.pendingIndex > 0) {
            this.logger.debug(`Flushing ${this.pendingIndex} pending requests`);
            await this.forceFlush();
        }

        // Wait for any active flush to complete
        const start = Date.now();
        while (this.isFlushing && (Date.now() - start < timeoutMs)) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.logger) this.logger.info('RequestManager shutdown complete');
    }
}

module.exports = RequestManager;
