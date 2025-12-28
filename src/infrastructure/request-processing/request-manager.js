/**
 * RequestManager - Configurable request coalescing handler.
 * Batches requests for throughput or processes immediately for low latency.
 * Uses double-buffer (ping-pong) pattern for zero-allocation flushing.
 */

const RequestProcessingPort = require('../../domain/contracts/request-processing.contract');

class RequestManager extends RequestProcessingPort {

    /**
     * @param {Function} processor - Async batch processor (receives array, returns array).
     * @param {Object} [options] - Config options.
     * @param {boolean} [options.enabled=true] - Enable coalescing.
     * @param {number} [options.maxWaitTime=10] - Max wait (ms) before flush.
     * @param {number} [options.maxBatchSize=100] - Max batch size.
     * @param {Logger} [options.logger] - Logger.
     */
    constructor(processor, options = {}) {
        super();

        this.processor = processor;

        // Configuration
        this.maxWaitTime = options.maxWaitTime;
        this.maxBatchSize = options.maxBatchSize;
        this.enableCoalescing = options.enabled;
        this.logger = options.logger;

        // Double-buffer (ping-pong) pattern for coalescing
        // Allocate double the size to handle overflow from 
        // requests that are added while a flush is in progress
        this.bufferA = new Array(this.maxBatchSize * 2);
        this.bufferB = new Array(this.maxBatchSize * 2);
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
            enabled: this.enableCoalescing,
            maxWaitTime: this.maxWaitTime,
            maxBatchSize: this.maxBatchSize
        });
    }

    /**
     * Adds a request. Batches if enabled, else processes immediately.
     * @param {*} data - Request data.
     * @returns {Promise<*>} Result.
     */
    async add(data) {
        this.metrics.totalRequests++;

        if (!this.enableCoalescing) {
            this.metrics.bypassedRequests++;
            // Wrap in array for batch processor if it's a single item
            // The processor expects an array of requests (batches)
            return this.processor([data]).then(results => results[0]);
        }

        return new Promise((resolve, reject) => {
            this.activeBuffer[this.pendingIndex++] = { data, resolve, reject, timestamp: Date.now() };

            if (this.pendingIndex >= this.maxBatchSize) {
                this.flush();
            } else if (this.pendingIndex === 1 && !this.timer) {
                this.timer = setTimeout(() => {
                    this.timer = null;
                    this.flush();
                }, this.maxWaitTime);
            }
        });
    }

    async flush() {
        if (this.isFlushing || this.pendingIndex === 0) {
            return;
        }

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.isFlushing = true;

        // Wrap execution in a promise we can track for shutdown purposes
        this.activeFlushPromise = (async () => {
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
                const dataArray = new Array(batchSize);
                for (let i = 0; i < batchSize; i++) {
                    dataArray[i] = batch[i].data;
                }

                this.logger.debug('Processing batch', { batchSize });

                const results = await this.processor(dataArray);

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
                    this.timer = setTimeout(() => {
                        this.timer = null;
                        this.flush();
                    }, this.maxWaitTime);
                }
            }
        })();

        await this.activeFlushPromise;
        this.activeFlushPromise = null;
    }

    async forceFlush() {
        if (this.pendingIndex > 0) {
            await this.flush();
        }
    }

    getStats() {
        const coalescingRate = this.metrics.totalRequests > 0
            ? ((this.metrics.totalCoalesced / this.metrics.totalRequests) * 100).toFixed(2)
            : 0;

        return {
            enabled: this.enableCoalescing,
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

    setEnabled(enabled) {
        this.enableCoalescing = enabled;
        this.logger.info(this.enableCoalescing ? 'Coalescing enabled' : 'Coalescing disabled');
        if (!this.enableCoalescing && this.pendingIndex > 0) {
            this.flush();
        }
    }

    updateConfig(config) {
        if (config.maxWaitTime !== undefined) this.maxWaitTime = config.maxWaitTime;
        if (config.maxBatchSize !== undefined) this.maxBatchSize = config.maxBatchSize;
        this.logger.info('Config updated', { maxWaitTime: this.maxWaitTime, maxBatchSize: this.maxBatchSize });
    }

    async shutdown(timeoutMs = 5000) {
        this.logger.info('RequestManager shutting down...');

        this.enableCoalescing = false;

        if (this.pendingIndex > 0) {
            this.logger.debug(`Flushing ${this.pendingIndex} pending requests`);
            await this.forceFlush();
        }

        // Wait for any active background flush to complete (e.g. triggered by timer or add())
        if (this.activeFlushPromise) {
            const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
            await Promise.race([this.activeFlushPromise, timeout]);
        }

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.logger.info('RequestManager shutdown complete');
    }
}

module.exports = RequestManager;

