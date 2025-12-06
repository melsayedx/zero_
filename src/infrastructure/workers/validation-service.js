/**
 * Validation Service with Worker Thread Support
 *
 * Provides both synchronous and asynchronous validation methods.
 * Automatically chooses the best approach based on batch size and system load.
 *
 * Strategies:
 * - Small batches (< 100 logs): Use main thread (no overhead)
 * - Medium batches (100-1000 logs): Use workers for CPU-intensive validation
 * - Large batches (> 1000 logs): Use multiple workers in parallel
 */

const WorkerPool = require('./worker-pool');
const LogEntry = require('../../domain/entities/log-entry');

class ValidationService {
  constructor(options = {}) {
    this.workerPool = new WorkerPool(options.workerPool);

    // Configuration thresholds
    this.smallBatchThreshold = options.smallBatchThreshold || 50;   // Use main thread
    this.mediumBatchThreshold = options.mediumBatchThreshold || 500; // Use single worker
    this.largeBatchThreshold = options.largeBatchThreshold || 2000; // Use multiple workers

    // Performance tuning
    this.enableWorkerValidation = options.enableWorkerValidation !== false;
    this.forceWorkerValidation = options.forceWorkerValidation || false;

    console.log('[ValidationService] Initialized with worker thread support');
    console.log(`[ValidationService] Thresholds: small=${this.smallBatchThreshold}, medium=${this.mediumBatchThreshold}, large=${this.largeBatchThreshold}`);
  }

  /**
   * Validate batch of logs using optimal strategy
   */
  async validateBatch(logsDataArray) {
    const batchSize = logsDataArray.length;

    // Force main thread for small batches or when workers are disabled
    if (!this.enableWorkerValidation ||
        (!this.forceWorkerValidation && batchSize <= this.smallBatchThreshold)) {
      return await this.validateBatchSync(logsDataArray);
    }

    // Use workers for larger batches
    if (batchSize <= this.mediumBatchThreshold) {
      // Single worker
      return this.validateBatchWithWorker(logsDataArray);
    } else {
      // Multiple workers for very large batches
      return this.validateBatchParallel(logsDataArray);
    }
  }

  /**
   * Synchronous validation (main thread)
   */
  async validateBatchSync(logsDataArray) {
    const startTime = Date.now();

    try {
      const result = await LogEntry.createBatch(logsDataArray);

      const processingTime = Date.now() - startTime;

      return {
        ...result,
        processingTime,
        strategy: 'sync',
        throughput: processingTime === 0
          ? logsDataArray.length
          : Math.round((logsDataArray.length / processingTime) * 1000)
      };
    } catch (error) {
      throw new Error(`Sync validation failed: ${error.message}`);
    }
  }

  /**
   * Validate with single worker thread
   */
  async validateBatchWithWorker(logsDataArray) {
    const startTime = Date.now();

    try {
      const result = await this.workerPool.execute('validate_batch', {
        logsDataArray
      });

      const processingTime = Date.now() - startTime;

      // Convert validated plain objects to LogEntry instances
      result.validEntries = result.validEntries.map(data =>
        LogEntry.create(data)
      );

      return {
        ...result,
        processingTime,
        strategy: 'single-worker',
        throughput: processingTime === 0
          ? logsDataArray.length
          : Math.round((logsDataArray.length / processingTime) * 1000)
      };
    } catch (error) {
      // Fallback to sync validation if worker fails
      console.warn('[ValidationService] Worker validation failed, falling back to sync:', error.message);
      return await this.validateBatchSync(logsDataArray);
    }
  }

  /**
   * Validate large batches using multiple workers in parallel
   */
  async validateBatchParallel(logsDataArray) {
    const startTime = Date.now();
    const numWorkers = Math.min(
      Math.ceil(logsDataArray.length / this.mediumBatchThreshold),
      this.workerPool.maxWorkers
    );

    // Split the batch into chunks
    const chunkSize = Math.ceil(logsDataArray.length / numWorkers);
    const chunks = [];
    for (let i = 0; i < logsDataArray.length; i += chunkSize) {
      chunks.push(logsDataArray.slice(i, i + chunkSize));
    }

    try {
      // Process chunks in parallel
      const promises = chunks.map(chunk =>
        this.validateBatchWithWorker(chunk)
      );

      const results = await Promise.all(promises);

      // Combine results
      const combinedResult = {
        validEntries: [],
        errors: []
      };

      results.forEach(result => {
        combinedResult.validEntries.push(...result.validEntries);
        combinedResult.errors.push(...result.errors);
      });

      const processingTime = Date.now() - startTime;

      return {
        ...combinedResult,
        processingTime,
        strategy: `parallel-${numWorkers}-workers`,
        throughput: processingTime === 0
          ? logsDataArray.length
          : Math.round((logsDataArray.length / processingTime) * 1000),
        workers: numWorkers,
        chunks: chunks.length
      };
    } catch (error) {
      console.warn('[ValidationService] Parallel validation failed, falling back to sync:', error.message);
      return await this.validateBatchSync(logsDataArray);
    }
  }

  /**
   * Parse JSON using worker thread (for large JSON payloads)
   */
  async parseJson(jsonString) {
    const stringSize = jsonString.length;
    const threshold = process.env.JSON_WORKER_THRESHOLD || 100000; // 100KB default

    // Use main thread for small JSON
    if (stringSize < threshold) {
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        throw new Error(`JSON parsing failed: ${error.message}`);
      }
    }

    // Use worker for large JSON
    try {
      return await this.workerPool.execute('parse_json', { jsonString });
    } catch (error) {
      // Fallback to main thread
      console.warn('[ValidationService] Worker JSON parsing failed, falling back to sync');
      return JSON.parse(jsonString);
    }
  }

  /**
   * Decode protobuf using worker thread (for large protobuf payloads)
   */
  async decodeProtobuf(buffer, isBatch = false) {
    const bufferSize = buffer.length;
    const sizeThreshold = parseInt(process.env.PROTOBUF_SIZE_THRESHOLD) || 100000; // 100KB
    const enableProtobufWorkers = process.env.ENABLE_PROTOBUF_WORKERS !== 'false';

    // Use main thread for small buffers or when workers disabled
    if (!enableProtobufWorkers || bufferSize < sizeThreshold) {
      return null; // Let main thread handle it
    }

    // Use worker for large protobuf payloads
    try {
      const messageType = isBatch ? 'decode_protobuf_batch' : 'decode_protobuf';
      const result = await this.workerPool.execute(messageType, { buffer });
      return result;
    } catch (error) {
      // Fallback to main thread
      console.warn('[ValidationService] Worker protobuf decoding failed, falling back to sync:', error.message);
      return null; // Signal to use main thread
    }
  }

  /**
   * Transform data using worker thread (for large result sets)
   */
  async transformData(rows) {
    const rowCount = rows.length;
    const threshold = parseInt(process.env.TRANSFORM_WORKER_THRESHOLD) || 5000;

    // Use main thread for small result sets
    if (rowCount < threshold) {
      return rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        timestamp: row.timestamp ? new Date(row.timestamp) : null
      }));
    }

    // Use worker for large result sets
    try {
      return await this.workerPool.execute('transform_data', { rows });
    } catch (error) {
      // Fallback to main thread
      console.warn('[ValidationService] Worker data transformation failed, falling back to sync');
      return rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        timestamp: row.timestamp ? new Date(row.timestamp) : null
      }));
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    const poolStats = this.workerPool.getStats();

    return {
      ...poolStats,
      service: {
        smallBatchThreshold: this.smallBatchThreshold,
        mediumBatchThreshold: this.mediumBatchThreshold,
        largeBatchThreshold: this.largeBatchThreshold,
        enableWorkerValidation: this.enableWorkerValidation,
        forceWorkerValidation: this.forceWorkerValidation,
        jsonWorkerThreshold: parseInt(process.env.JSON_WORKER_THRESHOLD) || 100000,
        protobufSizeThreshold: parseInt(process.env.PROTOBUF_SIZE_THRESHOLD) || 100000,
        transformWorkerThreshold: parseInt(process.env.TRANSFORM_WORKER_THRESHOLD) || 5000,
        enableProtobufWorkers: process.env.ENABLE_PROTOBUF_WORKERS !== 'false'
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const poolStats = this.workerPool.getStats();

    return {
      healthy: poolStats.workers.some(w => w.health === 'healthy'),
      workerPool: poolStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[ValidationService] Shutting down...');
    await this.workerPool.shutdown();
    console.log('[ValidationService] Shutdown complete');
  }
}

module.exports = ValidationService;
