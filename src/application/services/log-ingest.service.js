/**
 * LogIngestionService - Application service orchestrating high-throughput log ingestion.
 *
 * This service implements the application layer orchestration pattern for log ingestion.
 * It is a PURE Application Service that relies on the Domain Layer (IngestLogUseCase)
 * and is used by Infrastructure Layer components (RequestManager/Coalescer).
 *
 * It provides intelligent batch processing capabilities:
 * - **Smart Batching**: Optimizes processing of large arrays of logs
 * - **Pre-allocation**: Uses advanced memory management for zero-allocation performance
 * - **Result Correlation**: Maps batch results back to individual requests
 *
 * The service follows Onion Architecture principles:
 * - **Domain Layer**: IngestLogUseCase (Dependencies)
 * - **Application Layer**: LogIngestionService (This Service)
 * - **Infrastructure Layer**: RequestManager (Dependents)
 */

const IngestResult = require('../use-cases/logs/ingest-result');

class LogIngestionService {

  /**
   * Create a new LogIngestionService instance.
   *
   * @param {IngestLogUseCase} ingestUseCase - Domain use case handling log ingestion business logic
   * @param {Object} [options={}] - Service configuration options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(ingestUseCase, options = {}) {
    this.ingestUseCase = ingestUseCase;
    this.logger = options.logger;

    this.metrics = {
      totalRequests: 0,
      totalLogs: 0,
      processedBatches: 0
    };

    if (this.logger) {
      this.logger.info('LogIngestionService initialized');
    }
  }

  /**
   * Process a batch of requests through the domain use case with optimized pre-allocation and error handling.
   *
   * This method implements a three-phase optimized batch processing pipeline designed for maximum
   * performance in high-throughput log ingestion scenarios. It flattens multiple requests into a
   * single large batch for efficient domain processing, then distributes results back to individual
   * requests with zero array reallocations during processing.
   *
   * **PHASE 1 - Size Calculation**: Single O(n) pass to calculate exact array sizes
   * **PHASE 2 - Pre-allocation**: Allocate all arrays to exact required sizes (single allocation each)
   * **PHASE 3 - Direct Processing**: O(m) pass with direct indexed assignment (zero reallocations)
   *
   * @param {Array<Array<Object>>} requestBatch - Array of request data arrays, where each element is an array of log entries
   * @returns {Promise<Array<IngestResult>>} Array of results corresponding to each input request
   */
  async processBatch(requestBatch) {
    this.metrics.processedBatches++;
    this.logger.debug('Processing batch', { count: requestBatch.length });

    // Early return for empty batches
    if (!requestBatch || requestBatch.length === 0) {
      return [];
    }

    // PHASE 1: Single pass to calculate exact sizes (O(n) where n = requestBatch.length)
    let totalLogs = 0;
    for (let i = 0; i < requestBatch.length; i++) {
      const reqData = Array.isArray(requestBatch[i]) ? requestBatch[i] : [];
      totalLogs += reqData.length;
    }

    // Update global metrics
    this.metrics.totalRequests += requestBatch.length;
    this.metrics.totalLogs += totalLogs;

    // PHASE 2: Pre-allocate all arrays to exact required sizes (single allocation per array)
    const results = new Array(requestBatch.length);
    const requestMeta = new Array(requestBatch.length);
    const allLogs = new Array(totalLogs);
    const indexToRequestMap = new Map();

    // PHASE 3: Single processing pass with direct indexed assignment (O(m) where m = totalLogs)
    let currentGlobalIndex = 0;
    let allLogsIndex = 0;

    for (let requestIndex = 0; requestIndex < requestBatch.length; requestIndex++) {
      const reqData = Array.isArray(requestBatch[requestIndex]) ? requestBatch[requestIndex] : [];

      // Direct assignment to pre-allocated array
      requestMeta[requestIndex] = { start: currentGlobalIndex, count: reqData.length };

      // Build lookup table for this request's logs
      for (let i = 0; i < reqData.length; i++) {
        indexToRequestMap.set(currentGlobalIndex + i, requestIndex);
      }

      // Direct assignment to pre-allocated allLogs array (no reallocations!)
      for (let i = 0; i < reqData.length; i++) {
        allLogs[allLogsIndex++] = reqData[i];
      }

      currentGlobalIndex += reqData.length;
    }

    // Early return if no logs to process
    if (allLogsIndex === 0) {
      // Return empty results for all requests (direct assignment to pre-allocated array)
      for (let i = 0; i < requestBatch.length; i++) {
        results[i] = new IngestResult({
          accepted: 0,
          rejected: 0,
          errors: [],
          processingTime: 0,
          throughput: 0,
          validationMode: 'optimized-service'
        });
      }
      return results;
    }

    try {
      // Process through use case with raw logs
      const batchResult = await this.ingestUseCase.execute(allLogs);

      this.logger.debug('Batch processed', { count: allLogs.length });

      const aggregatedErrors = Array.isArray(batchResult.errors) ? batchResult.errors : [];

      // Initialize error arrays for each request (one per request)
      const errorsPerRequest = new Array(requestMeta.length);
      for (let i = 0; i < requestMeta.length; i++) {
        errorsPerRequest[i] = [];
      }

      // Map aggregated errors back to their originating request using O(1) lookup
      for (let i = 0; i < aggregatedErrors.length; i++) {
        const error = aggregatedErrors[i];
        const targetIndex = indexToRequestMap.get(error.index);
        if (targetIndex !== undefined) {
          errorsPerRequest[targetIndex].push(error);
        }
      }

      // Pre-compute shared values for all results
      const sharedProcessingTime = batchResult.processingTime;
      const sharedThroughput = batchResult.throughput;
      const sharedValidationMode = `${batchResult.validationMode || 'standard'}-coalesced`;

      // Distribute results back to individual requests (direct assignment to pre-allocated array)
      for (let i = 0; i < requestBatch.length; i++) {
        const meta = requestMeta[i];
        const requestErrors = errorsPerRequest[i];
        const rejected = requestErrors.length;
        const accepted = Math.max(0, meta.count - rejected);

        results[i] = new IngestResult({
          accepted,
          rejected,
          errors: requestErrors,
          processingTime: sharedProcessingTime,
          throughput: sharedThroughput,
          validationMode: sharedValidationMode
        });
      }

      return results;
    } catch (error) {
      // All requests in batch failed - create error result for each request
      const errorObj = { error: error.message };

      for (let i = 0; i < requestBatch.length; i++) {
        const reqData = requestBatch[i];
        const rejected = Array.isArray(reqData) ? reqData.length : 0;
        results[i] = new IngestResult({
          accepted: 0,
          rejected,
          errors: [errorObj],
          processingTime: 0,
          throughput: 0,
          validationMode: 'optimized-service'
        });
      }
      return results;
    }
  }

  /**
   * Get comprehensive statistics and metrics for the service.
   *
   * @returns {Object} Service statistics and metrics
   */
  getStats() {
    return {
      service: {
        totalRequests: this.metrics.totalRequests,
        totalLogs: this.metrics.totalLogs,
        processedBatches: this.metrics.processedBatches,
        avgLogsPerRequest: this.metrics.totalRequests > 0
          ? (this.metrics.totalLogs / this.metrics.totalRequests).toFixed(2)
          : 0
      }
    };
  }
}

module.exports = LogIngestionService;
