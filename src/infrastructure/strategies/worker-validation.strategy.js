/**
 * WorkerValidationStrategy - Worker thread validation support.
 * Selects sync, single worker, or parallel workers based on batch size.
 * Composite Pattern
 */

const WorkerPool = require('../workers/worker-pool');
const ValidationStrategyContract = require('../../domain/contracts/validation-strategy.contract');
const SyncValidationStrategy = require('./sync-validation.strategy');

class WorkerValidationStrategy extends ValidationStrategyContract {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    // Pass logger to WorkerPool if available
    const workerPoolOptions = options.workerPool || {};
    workerPoolOptions.logger = this.logger;
    this.workerPool = new WorkerPool(workerPoolOptions);

    // Use injected sync strategy or create default - Composite Pattern
    this.defaultStrategy = options.defaultStrategy || new SyncValidationStrategy();

    // Configuration thresholds
    this.smallBatchThreshold = options.smallBatchThreshold;   // Use main thread
    this.mediumBatchThreshold = options.mediumBatchThreshold; // Use single worker

    // Performance tuning
    this.enableWorkerValidation = options.enableWorkerValidation;
    this.forceWorkerValidation = options.forceWorkerValidation;

    this.logger.info('WorkerValidationStrategy initialized with worker thread support');
    this.logger.debug('Validation thresholds', { small: this.smallBatchThreshold, medium: this.mediumBatchThreshold });
  }

  /**
   * Validates a batch using optimal strategy.
   * @param {Object[]} logsDataArray - Raw log data.
   * @returns {Promise<Object>} Validation result.
   */
  async validateBatch(logsDataArray) {
    const batchSize = logsDataArray.length;

    // Force main thread for small batches or when workers are disabled
    if (!this.enableWorkerValidation ||
      (!this.forceWorkerValidation && batchSize <= this.smallBatchThreshold)) {
      return await this.validateBatchSync(logsDataArray);
    }
    this.logger.info('Using worker validation', { batchSize });

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
   * Validates synchronously (main thread).
   * @param {Object[]} logsDataArray - Raw log data.
   * @returns {Promise<Object>} Validation result.
   */
  async validateBatchSync(logsDataArray) {
    const startTime = Date.now();

    try {
      const result = await this.defaultStrategy.validateBatch(logsDataArray);

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
   * Validates using a single worker thread.
   * @param {Object[]} logsDataArray - Raw log data.
   * @returns {Promise<Object>} Validation result.
   */
  async validateBatchWithWorker(logsDataArray) {
    const startTime = Date.now();

    try {
      const result = await this.workerPool.execute('validate_batch', {
        logsDataArray
      });

      const processingTime = Date.now() - startTime;

      // Worker already outputs validated plain objects in the correct format
      // No need to create LogEntry instances (would cause double validation)

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
      this.logger.warn('Worker validation failed, falling back to sync', { error: error.message });
      return await this.validateBatchSync(logsDataArray);
    }
  }

  /**
   * Validates large batches in parallel.
   * @param {Object[]} logsDataArray - Raw log data.
   * @returns {Promise<Object>} Combined validation result.
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
      this.logger.warn('Parallel validation failed, falling back to sync', { error: error.message });
      return await this.validateBatchSync(logsDataArray);
    }
  }

  /**
   * Parses JSON via worker (for large payloads).
   * @param {string} jsonString - JSON string.
   * @returns {Promise<Object>} Parsed object.
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
      this.logger.warn('Worker JSON parsing failed, falling back to sync');
      return JSON.parse(jsonString);
    }
  }

  /**
   * Decodes Protobuf via worker (for large payloads).
   * @param {Buffer} buffer - Protobuf buffer.
   * @param {boolean} [isBatch=false] - Whether buffer contains a batch.
   * @returns {Promise<Object|null>} Decoded data or null to fallback.
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
      this.logger.warn('Worker protobuf decoding failed, falling back to sync', { error: error.message });
      return null; // Signal to use main thread
    }
  }

  /**
   * Transforms data via worker (for large result sets).
   * @param {Object[]} rows - Data rows.
   * @returns {Promise<Object[]>} Transformed rows.
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
      this.logger.warn('Worker data transformation failed, falling back to sync');
      return rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        timestamp: row.timestamp ? new Date(row.timestamp) : null
      }));
    }
  }

  /**
   * Gets service statistics.
   * @returns {Object} Strategy statistics.
   */
  getStats() {
    const poolStats = this.workerPool.getStats();

    return {
      ...poolStats,
      service: {
        smallBatchThreshold: this.smallBatchThreshold,
        mediumBatchThreshold: this.mediumBatchThreshold,
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
   * Performs health check.
   * @returns {Promise<Object>} Health status.
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
   * Performs graceful shutdown.
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.logger.info('WorkerValidationStrategy shutting down...');
    await this.workerPool.shutdown();
    this.logger.info('WorkerValidationStrategy shutdown complete');
  }
}

module.exports = WorkerValidationStrategy;
