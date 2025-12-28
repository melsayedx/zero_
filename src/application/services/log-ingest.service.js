const IngestResult = require('../use-cases/ingest-result');
// TODO: complete refactor
class LogIngestionService {

  /**
   * @param {IngestLogUseCase} ingestUseCase
   * @param {Object} [options={}] - Configuration options
   */
  constructor(ingestUseCase, options = {}) {
    this.ingestUseCase = ingestUseCase;
    this.logger = options.logger;

    this.metrics = {
      totalRequests: 0,
      totalLogs: 0,
      processedBatches: 0
    };

    this.logger.info('LogIngestionService initialized');
  }

  /**
   * Coalesces multiple requests into a single batch, processes via use case, then maps results back.
   * 1. Flatten - Merges all request arrays into one big allLogs array
   * 2. Track origins - Keeps a map of which log came from which request
   * 3. Process once - Sends the entire batch to ingestUseCase.execute(allLogs)
   * 4. Split results - Maps errors back to their original requests using the index map
   * 5. Return results - Returns an array of IngestResult objects, one per request
   * 
   * @param {Array<Array<Object>>} requestBatch - Array of log entry arrays
   * @returns {Promise<Array<IngestResult>>} Results for each request
   */
  async processBatch(requestBatch) {
    this.logger.debug('Processing batch', { count: requestBatch.length });

    if (!requestBatch || requestBatch.length === 0) {
      return [];
    }

    this.metrics.processedBatches++;

    const batchLen = requestBatch.length;

    // Normalize once - avoid repeated Array.isArray checks
    const normalizedBatch = new Array(batchLen);
    let totalLogs = 0;
    for (let i = 0; i < batchLen; i++) {
      const req = requestBatch[i];
      normalizedBatch[i] = Array.isArray(req) ? req : [];
      totalLogs += normalizedBatch[i].length;
    }

    this.metrics.totalRequests += batchLen;
    this.metrics.totalLogs += totalLogs;

    // Pre-allocate
    const results = new Array(batchLen);
    const requestCounts = new Array(batchLen);    // Just store counts, not full meta objects
    const allLogs = new Array(totalLogs);
    const indexToRequest = new Array(totalLogs);  // Array is faster than Map for sequential indices

    // Single pass: build allLogs and index mapping
    let logIdx = 0;
    for (let reqIdx = 0; reqIdx < batchLen; reqIdx++) {
      const reqData = normalizedBatch[reqIdx];
      requestCounts[reqIdx] = reqData.length;

      for (let i = 0; i < reqData.length; i++) {
        allLogs[logIdx] = reqData[i];
        indexToRequest[logIdx] = reqIdx;
        logIdx++;
      }
    }

    if (logIdx === 0) {
      for (let i = 0; i < batchLen; i++) {
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
      const batchResult = await this.ingestUseCase.execute(allLogs);
      this.logger.debug('Batch processed', { count: logIdx });

      const aggregatedErrors = batchResult.errors || [];

      // Initialize error arrays
      const errorsPerRequest = new Array(batchLen);
      for (let i = 0; i < batchLen; i++) {
        errorsPerRequest[i] = [];
      }

      // Map errors back using O(1) array lookup
      for (let i = 0; i < aggregatedErrors.length; i++) {
        const err = aggregatedErrors[i];
        const reqIdx = indexToRequest[err.index];
        if (reqIdx !== undefined) {
          errorsPerRequest[reqIdx].push(err);
        }
      }

      const sharedProcessingTime = batchResult.processingTime;
      const sharedThroughput = batchResult.throughput;
      const sharedValidationMode = `${batchResult.validationMode || 'standard'}-coalesced`;

      for (let i = 0; i < batchLen; i++) {
        const requestErrors = errorsPerRequest[i];
        const rejected = requestErrors.length;
        results[i] = new IngestResult({
          accepted: Math.max(0, requestCounts[i] - rejected),
          rejected,
          errors: requestErrors,
          processingTime: sharedProcessingTime,
          throughput: sharedThroughput,
          validationMode: sharedValidationMode
        });
      }

      return results;
    } catch (error) {
      const errorObj = { error: error.message };
      for (let i = 0; i < batchLen; i++) {
        results[i] = new IngestResult({
          accepted: 0,
          rejected: requestCounts[i],
          errors: [errorObj],
          processingTime: 0,
          throughput: 0,
          validationMode: 'optimized-service'
        });
      }
      return results;
    }
  }

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
