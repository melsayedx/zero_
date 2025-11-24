/**
 * OptimizedIngestService - Application service for high-throughput log ingestion with request coalescing.
 *
 * This service acts as an application layer orchestrator that wraps the IngestLogUseCase
 * with performance optimizations for high-volume scenarios. It implements request coalescing
 * to reduce database load during traffic bursts while maintaining low latency for individual requests.
 *
 * The service follows Clean Architecture principles by:
 * - Orchestrating domain logic (IngestLogUseCase) with infrastructure concerns (RequestCoalescer)
 * - Providing cross-cutting performance optimizations (batch processing, metrics)
 * - Maintaining separation between domain validation and application-level optimizations
 * - Enabling configuration-driven behavior without changing domain logic
 *
 * Key features:
 * - Intelligent request coalescing with configurable batch sizes and timeouts
 * - Automatic bypass for large batches to prevent latency spikes
 * - Comprehensive metrics collection for monitoring and optimization
 * - Runtime configuration updates without service restart
 * - Graceful handling of concurrent requests and error scenarios
 *
 * @example
 * ```javascript
 * // Create service with dependency injection
 * const coalescer = new RequestCoalescer(
 *   (dataArray) => service.processBatch(dataArray),
 *   { maxWaitTime: 10, maxBatchSize: 100 }
 * );
 * const service = new OptimizedIngestService(ingestUseCase, coalescer);
 *
 * // Process individual logs (automatically batched)
 * const result1 = await service.ingest({
 *   app_id: 'my-app',
 *   message: 'User logged in',
 *   level: 'INFO'
 * });
 *
 * // Process batch of logs (bypasses coalescing for immediate processing)
 * const batch = [
 *   { app_id: 'api', message: 'Request processed', level: 'INFO' },
 *   { app_id: 'api', message: 'Database error', level: 'ERROR' }
 * ];
 * const result2 = await service.ingest(batch);
 *
 * // Monitor performance
 * const stats = service.getStats();
 * console.log(`Processed ${stats.service.totalRequests} requests`);
 *
 * // Update configuration at runtime
 * service.updateConfig({
 *   useCoalescing: false,        // Disable during maintenance
 *   coalescerMaxBatchSize: 200   // Adjust batch size
 * });
 * ```
 */

const IngestResult = require('../../core/use-cases/logs/ingest-result');

class OptimizedIngestService {

  /**
   * Create a new OptimizedIngestService instance with dependency injection.
   *
   * Initializes the service with injected dependencies following Onion Architecture principles.
   * The RequestCoalescer is injected rather than composed, enabling better testability and
   * dependency management. Configuration options control the service's coalescing behavior.
   *
   * @param {IngestLogUseCase} ingestUseCase - The domain use case for log ingestion
   * @param {RequestCoalescer} requestCoalescer - The request coalescer for batching concurrent requests
   * @param {Object} [options={}] - Configuration options for service behavior
   * @param {boolean} [options.useCoalescing=true] - Whether to use coalescing for small requests
   *
 * @example
 * ```javascript
 * // Create dependencies with proper binding
 * const coalescer = new RequestCoalescer(
 *   (dataArray) => service.processBatch(dataArray),
 *   { maxWaitTime: 10, maxBatchSize: 100 }
 * );
 *
 * // Inject dependencies and configure behavior
 * const service = new OptimizedIngestService(ingestUseCase, coalescer, {
 *   useCoalescing: true  // Enable coalescing for small requests
 * });
 * ```
   */
  constructor(ingestUseCase, requestCoalescer, options = {}) {
    this.ingestUseCase = ingestUseCase;
    this.coalescer = requestCoalescer;

    // Configuration
    this.useCoalescing = options.useCoalescing !== false;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalLogs: 0,
      coalescedRequests: 0
    };
    
    console.log('[OptimizedIngestService] Initialized with config:', {
      useCoalescing: this.useCoalescing,
      coalescerEnabled: this.coalescer.enabled
    });
  }
  
  /**
   * Ingest a single log entry or batch of log entries with automatic optimization.
   *
   * This is the primary entry point for log ingestion. The method automatically determines
   * the optimal processing strategy based on the input size and current configuration:
   * - Small requests (< 50 logs) are coalesced for batch processing
   * - Large requests bypass coalescing for immediate processing
   * - All requests are tracked in metrics for monitoring and optimization
   *
   * The method handles both single log objects and arrays of logs seamlessly, providing
   * a unified API for different ingestion patterns while maintaining optimal performance.
   *
   * @param {Object|Array<Object>} data - Single log entry or array of log entries to ingest
   * @param {string} data.app_id - Application identifier for the log entry
   * @param {string} data.message - Log message content
   * @param {string} [data.level='INFO'] - Log level (DEBUG, INFO, WARN, ERROR, FATAL)
   * @param {string} [data.source] - Source identifier for the log entry
   * @param {Object} [data.metadata] - Additional metadata for the log entry
   * @returns {Promise<IngestResult>} Result containing acceptance/rejection counts and processing metrics
   *
 * @example
 * ```javascript
 * // Single log entry (coalesced with concurrent requests)
 * const result = await service.ingest({
 *   app_id: 'user-service',
 *   message: 'User authentication successful',
 *   level: 'INFO'
 * });
 *
 * // Batch of logs (bypasses coalescing for immediate processing)
 * const logs = [
 *   { app_id: 'api', message: 'Request processed', level: 'INFO' },
 *   { app_id: 'api', message: 'Database error', level: 'ERROR' }
 * ];
 * const batchResult = await service.ingest(logs);
 * console.log(`Processed ${batchResult.accepted} logs`);
 * ```
   */
  async ingest(data) {
    this.metrics.totalRequests++;
    
    // Handle single log
    if (!Array.isArray(data)) {
      data = [data];
    }
    
    this.metrics.totalLogs += data.length;
    
    // If coalescing is enabled, add to coalescer
    if (this.useCoalescing && data.length < 50) {
      // Only coalesce smaller requests; large batches go direct
      this.metrics.coalescedRequests++;
      return this.coalescer.add(data);
    }
    
    // Process directly (no coalescing for large batches)
    const results = await this.processBatch([data]);
    return results[0];
  }
  
  /**
   * Process a batch of requests through the domain use case with error handling and result distribution.
   *
   * This method is the core of the batch processing pipeline. It flattens multiple requests
   * into a single large batch for efficient domain processing, then distributes the results
   * back to individual requests. The method handles error aggregation and provides detailed
   * error mapping to ensure each request gets appropriate feedback.
   *
   * The batching strategy provides significant performance benefits:
   * - Single domain operation instead of multiple individual calls
   * - Efficient error correlation and result distribution
   * - Reduced overhead for large batch scenarios
   * - Maintained request-level granularity for error reporting
   *
   * @private
   * @param {Array<Array<Object>>} requestBatch - Array of request data arrays, where each element is an array of log entries
   * @returns {Promise<Array<IngestResult>>} Array of results corresponding to each input request
   *
   * @example
   * ```javascript
   * // Called internally by the coalescer or direct processing
   * const batch = [
   *   [{ app_id: 'app1', message: 'Log 1' }],           // Request 1: single log
   *   [{ app_id: 'app2', message: 'Log 2' }, { app_id: 'app2', message: 'Log 3' }] // Request 2: two logs
   * ];
   * const results = await this.processBatch(batch);
   * // results[0] contains result for first request (1 log)
   * // results[1] contains result for second request (2 logs)
   * ```
   */
  async processBatch(requestBatch) {
    const results = [];
    
    // Flatten all requests into a single large batch while tracking offsets
    const requestMeta = [];
    const allLogs = [];
    for (let i = 0; i < requestBatch.length; i++) {
      const reqData = Array.isArray(requestBatch[i]) ? requestBatch[i] : [];
      requestMeta.push({ start: allLogs.length, count: reqData.length });
      if (reqData.length > 0) {
        allLogs.push(...reqData);
      }
    }
    
    try {
      // Process through use case with raw logs
      const batchResult = await this.ingestUseCase.execute(allLogs);
      const aggregatedErrors = Array.isArray(batchResult.errors) ? batchResult.errors : [];
      const errorsPerRequest = requestMeta.map(() => []);

      // Map aggregated errors back to their originating request
      for (let i = 0; i < aggregatedErrors.length; i++) {
        const error = aggregatedErrors[i];
        const targetIndex = requestMeta.findIndex(meta =>
          error.index >= meta.start && error.index < meta.start + meta.count
        );
        if (targetIndex !== -1) {
          errorsPerRequest[targetIndex].push(error);
        }
      }
      
      // Distribute results back to individual requests
      for (let i = 0; i < requestBatch.length; i++) {
        const meta = requestMeta[i];
        const requestErrors = errorsPerRequest[i];
        const rejected = requestErrors.length;
        const accepted = Math.max(0, meta.count - rejected);

        results.push(new IngestResult({
          accepted,
          rejected,
          errors: requestErrors,
          processingTime: batchResult.processingTime,
          throughput: batchResult.throughput,
          validationMode: `${batchResult.validationMode || 'standard'}-coalesced`
        }));
      }
      
      return results;
    } catch (error) {
      // All requests in batch failed
      for (let i = 0; i < requestBatch.length; i++) {
        const reqData = requestBatch[i];
        const rejected = Array.isArray(reqData) ? reqData.length : 0;
        results.push(new IngestResult({
          accepted: 0,
          rejected,
          errors: [{ error: error.message }],
          processingTime: 0,
          throughput: 0,
          validationMode: 'optimized-service'
        }));
      }
      return results;
    }
  }
  
  /**
   * Force flush any pending coalesced requests for immediate processing.
   *
   * This method ensures all queued requests are processed immediately, bypassing the
   * normal coalescing timeout. It's primarily used during graceful shutdowns to ensure
   * no requests are lost, but can also be called for testing or administrative purposes.
   *
   * The flush operation processes all pending requests as a single batch, maintaining
   * the efficiency benefits of batch processing while ensuring timely completion.
   *
   * @returns {Promise<void>} Resolves when all pending requests have been processed
   *
 * @example
 * ```javascript
 * // Graceful shutdown - process remaining requests
 * process.on('SIGTERM', async () => {
 *   await service.flush(); // Process queued requests before shutdown
 *   process.exit(0);
 * });
 * ```
   */
  async flush() {
    if (this.useCoalescing) {
      await this.coalescer.forceFlush();
    }
  }
  
  /**
   * Get comprehensive statistics and metrics for the service and coalescer.
   *
   * Returns detailed operational metrics that can be used for monitoring, debugging,
   * and performance optimization. The statistics include both service-level metrics
   * (request counts, throughput) and coalescer-specific metrics (batch efficiency,
   * wait times) when coalescing is enabled.
   *
   * @returns {Object} Service statistics and metrics
   * @returns {Object} return.service - Core service metrics
   * @returns {number} return.service.totalRequests - Total number of ingest requests processed
   * @returns {number} return.service.totalLogs - Total number of individual log entries processed
   * @returns {number} return.service.coalescedRequests - Number of requests that went through coalescing
   * @returns {string} return.service.avgLogsPerRequest - Average logs per request (formatted to 2 decimals)
   * @returns {Object} [return.coalescer] - Request coalescer statistics (only present if coalescing enabled)
   *
 * @example
 * ```javascript
 * // Monitor service and coalescer performance
 * const stats = service.getStats();
 * console.log(`Processed ${stats.service.totalRequests} requests`);
 * console.log(`Average ${stats.service.avgLogsPerRequest} logs per request`);
 *
 * if (stats.coalescer) {
 *   console.log(`Coalescing efficiency: ${stats.coalescer.coalescingRate}`);
 * }
 * ```
   */
  getStats() {
    const stats = {
      service: {
        totalRequests: this.metrics.totalRequests,
        totalLogs: this.metrics.totalLogs,
        coalescedRequests: this.metrics.coalescedRequests,
        avgLogsPerRequest: this.metrics.totalRequests > 0
          ? (this.metrics.totalLogs / this.metrics.totalRequests).toFixed(2)
          : 0
      }
    };
    
    if (this.useCoalescing) {
      stats.coalescer = this.coalescer.getStats();
    }
    
    return stats;
  }
  
  /**
   * Update service configuration at runtime without requiring a restart.
   *
   * Allows dynamic reconfiguration of coalescing behavior and performance parameters.
   * Changes take effect immediately for new requests while respecting ongoing operations.
   * This enables adaptive performance tuning based on traffic patterns and system load.
   *
   * @param {Object} config - Configuration updates to apply
   * @param {boolean} [config.useCoalescing] - Enable/disable coalescing for small requests
   * @param {number} [config.coalescerMaxWaitTime] - Update maximum wait time for batching
   * @param {number} [config.coalescerMaxBatchSize] - Update maximum batch size for coalescing
   *
 * @example
 * ```javascript
 * // Enable coalescing during high traffic
 * service.updateConfig({
 *   useCoalescing: true,
 *   coalescerMaxBatchSize: 200
 * });
 *
 * // Disable coalescing for maintenance
 * service.updateConfig({
 *   useCoalescing: false
 * });
 *
 * // Adjust timeout for latency-sensitive scenarios
 * service.updateConfig({
 *   coalescerMaxWaitTime: 5
 * });
 * ```
   */
  updateConfig(config) {
    if (config.useCoalescing !== undefined) {
      this.useCoalescing = config.useCoalescing;
      this.coalescer.setEnabled(config.useCoalescing);
    }
    
    if (config.coalescerMaxWaitTime || config.coalescerMaxBatchSize) {
      this.coalescer.updateConfig({
        maxWaitTime: config.coalescerMaxWaitTime,
        maxBatchSize: config.coalescerMaxBatchSize
      });
    }
    
    console.log('[OptimizedIngestService] Config updated:', config);
  }
}

/**
 * @typedef {OptimizedIngestService} OptimizedIngestService
 * @property {IngestLogUseCase} ingestUseCase - The wrapped domain use case
 * @property {RequestCoalescer} coalescer - Injected request coalescing instance for batching
 * @property {boolean} useCoalescing - Whether coalescing is enabled for small requests
 * @property {Object} metrics - Service performance metrics
 * @property {number} metrics.totalRequests - Total requests processed
 * @property {number} metrics.totalLogs - Total log entries processed
 * @property {number} metrics.coalescedRequests - Requests that went through coalescing
 */

module.exports = OptimizedIngestService;

