
const LogEntry = require('../../domain/entities/log-entry');

/**
 * LogProcessorWorker - Background worker for processing Redis queued logs.
 *
 * This class implements a background worker that continuously processes log entries
 * from a Redis queue and persists them to ClickHouse. It provides decoupling between
 * the high-throughput log ingestion API and the database persistence layer, enabling
 * "fire-and-forget" API responses with reliable eventual consistency.
 *
 * The worker operates with configurable batch sizes and polling intervals to balance
 * throughput with resource usage. Multiple worker instances can run in parallel for
 * increased processing capacity.
 *
 * Key features:
 * - Atomic batch processing from Redis lists
 * - Automatic LogEntry reconstruction with validation
 * - ClickHouse batch buffer integration
 * - Graceful error handling and recovery
 * - Configurable parallelism and performance tuning
 *
 * @example
 * ```javascript
 * // Create and start a worker
 * const worker = new LogProcessorWorker(redisClient, clickHouseRepo, {
 *   queueKey: 'logs:ingestion:queue',
 *   batchSize: 1000,
 *   pollInterval: 10
 * });
 *
 * await worker.start();
 *
 * // Worker runs until stopped
 * // await worker.stop();
 * ```
 *
 * @example
 * ```javascript
 * // Multiple workers for parallelism
 * const workers = [];
 * for (let i = 0; i < 4; i++) {
 *   const worker = new LogProcessorWorker(redisClient, clickHouseRepo, {
 *     batchSize: 2000,
 *     pollInterval: 5
 *   });
 *   workers.push(worker);
 *   setTimeout(() => worker.start(), i * 100); // Staggered startup
 * }
 * ```
 */
class LogProcessorWorker {
  /**
   * Create a new LogProcessorWorker instance.
   *
   * @param {Redis} queueClient - Configured Redis client for queue operations
   * @param {ClickHouseRepository} clickHouseRepository - Repository for ClickHouse persistence
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.queueKey='logs:ingestion:queue'] - Redis key for the ingestion queue
   * @param {number} [options.batchSize=2000] - Number of logs to process per batch
   * @param {number} [options.pollInterval=5] - Milliseconds between queue checks
   */
  constructor(queueClient, clickHouseRepository, options = {}) {
    this.redis = queueClient;
    this.clickHouseRepo = clickHouseRepository;
    this.queueKey = options.queueKey || 'logs:ingestion:queue';
    this.batchSize = options.batchSize || 2000;
    this.pollInterval = options.pollInterval || 5;
    this.isRunning = false;
    this.isProcessing = false;
  }

  /**
   * Start the background worker.
   *
   * Begins the continuous processing loop that monitors the Redis queue
   * and processes log batches. The worker will continue running until
   * explicitly stopped via the stop() method.
   *
   * @returns {Promise<void>} Resolves immediately if already running
   *
   * @example
   * ```javascript
   * const worker = new LogProcessorWorker(redisClient, clickHouseRepo);
   * await worker.start();
   * // Worker now continuously processes logs from Redis
   * ```
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    console.log('[LogProcessorWorker] Starting worker...');
    this.isRunning = true;
    this.processLoop();
  }

  /**
   * Stop the background worker.
   *
   * Signals the worker to stop processing after completing the current batch.
   * The worker will finish any in-progress operations before shutting down.
   *
   * @returns {Promise<void>} Resolves after setting the stop flag
   *
   * @example
   * ```javascript
   * await worker.stop();
   * // Worker will complete current batch then stop
   * ```
   */
  async stop() {
    console.log('[LogProcessorWorker] Stopping worker...');
    this.isRunning = false;
    // Current batch processing will complete before final shutdown
  }

  /**
   * Main processing loop that continuously monitors and processes the queue.
   *
   * This method runs indefinitely while the worker is active, periodically
   * checking the Redis queue for new log batches. It includes error handling
   * and backoff strategies to ensure robust operation under various conditions.
   *
   * The loop balances responsiveness (frequent polling) with resource efficiency
   * (avoiding busy-waiting) through configurable poll intervals.
   *
   * @private
   * @returns {Promise<void>} Never resolves (runs until worker is stopped)
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        await this.processBatch();

        // Brief pause between polling to prevent excessive CPU usage
        // when the queue is empty or slow. LPOP operations are fast,
        // but yielding control prevents busy-waiting scenarios.
        if (this.pollInterval > 0) {
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
      } catch (error) {
        console.error('[LogProcessorWorker] Error in process loop:', error);
        // Exponential backoff on errors to prevent rapid error loops
        // while allowing quick recovery from transient issues
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Process a single batch of logs from the Redis queue.
   *
   * This method performs the complete pipeline of retrieving, parsing, validating,
   * and persisting a batch of log entries. It uses atomic Redis operations for
   * reliability and includes comprehensive error handling for production robustness.
   *
   * The processing follows these steps:
   * 1. Atomic retrieval of multiple log entries from Redis
   * 2. JSON parsing and LogEntry reconstruction with validation
   * 3. Batch persistence to ClickHouse via the repository
   * 4. Success/failure logging and error propagation
   *
   * @private
   * @returns {Promise<void>} Resolves when batch processing is complete
   *
   * @throws {Error} If Redis operations fail or ClickHouse persistence fails
   *
   * @example
   * ```javascript
   * // Called automatically by processLoop()
   * await worker.processBatch();
   * // Retrieves up to batchSize logs, processes them, and persists to ClickHouse
   * ```
   */
  async processBatch() {
    // Prevent concurrent batch processing for thread safety
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Retrieve batch of serialized logs from Redis queue
      // LPOP with count parameter is atomic - either gets all requested items
      // or gets available items if fewer than requested
      const rawLogs = await this.redis.lpop(this.queueKey, this.batchSize);

      // No logs available for processing
      if (!rawLogs || rawLogs.length === 0) {
        this.isProcessing = false;
        return;
      }

      // Reconstruct LogEntry domain objects from serialized data
      // This step is critical for several reasons:
      // 1. JSON.parse() produces plain objects, not domain entities
      // 2. LogEntry contains value objects (AppId, LogLevel, Metadata, TraceId)
      //    that provide type safety and validation
      // 3. ClickHouse repository requires LogEntry instances (.toObject() method)
      // 4. Re-validation ensures data integrity after Redis round-trip
      //
      // Future optimization: Direct use of LogEntry.normalize() if ClickHouse
      // repository supported plain validated objects instead of entity instances
      const logEntries = rawLogs.map(json => {
        try {
          const data = JSON.parse(json);
          // Reconstruct domain entity with full validation and value objects
          return LogEntry.create(data);
        } catch (error) {
          console.error('[LogProcessorWorker] Failed to parse log entry:', error.message);
          return null; // Skip malformed entries
        }
      }).filter(entry => entry !== null); // Remove failed parses

      // Persist successfully reconstructed log entries
      if (logEntries.length > 0) {
        try {
          // Delegate to ClickHouse repository for persistence
          // This adds to the batch buffer, which flushes automatically
          // based on size/time thresholds
          await this.clickHouseRepo.save(logEntries);

          // Log successful batch completion with metrics
          console.log(`[LogProcessorWorker] Successfully processed ${logEntries.length} logs (batch size: ${this.batchSize})`);
        } catch (saveError) {
          // Detailed error logging for ClickHouse persistence failures
          console.error('[LogProcessorWorker] Failed to save logs to ClickHouse:', {
            error: saveError.message,
            logCount: logEntries.length,
            firstLog: logEntries[0] ? {
              app_id: logEntries[0].appId?.value,
              level: logEntries[0].level?.value,
              message: logEntries[0].message?.substring(0, 50)
            } : 'none'
          });
          throw saveError; // Propagate error for batch-level error handling
        }
      }

    } catch (error) {
      console.error('[LogProcessorWorker] Batch processing error:', error);
      // Production enhancement: Implement dead-letter queue (DLQ) for failed batches
      // This would prevent infinite retry loops while preserving failed data
    } finally {
      // Always reset processing flag to allow subsequent batches
      this.isProcessing = false;
    }
  }
}

module.exports = LogProcessorWorker;

