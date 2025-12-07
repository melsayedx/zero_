const LogEntry = require('../../domain/entities/log-entry');
const RedisStreamQueue = require('../queues/redis-stream-queue');
const BatchBuffer = require('../buffers/batch-buffer');

/**
 * LogProcessorWorker - Crash-proof background worker for processing Redis Stream logs.
 *
 * This class implements a crash-proof background worker that continuously processes log
 * entries from a Redis Stream and persists them to a database via a generic repository.
 * It uses Redis consumer groups to ensure no data loss even if the worker crashes.
 *
 * **Crash-Proof Architecture:**
 * 1. Logs are read from Redis Stream using XREADGROUP (moved to Pending Entry List)
 * 2. Logs are buffered in BatchBuffer with attached Redis message IDs
 * 3. On flush, logs are persisted to the database
 * 4. Only after successful DB write, Redis messages are acknowledged (XACK)
 * 5. If crash occurs before XACK, messages remain in PEL and are recovered on restart
 *
 * Key features:
 * - Redis Streams with consumer groups for durable message queuing
 * - Automatic pending message recovery on startup
 * - BatchBuffer integration with ACK callback
 * - Generic repository support (ClickHouse, TimescaleDB, etc.)
 * - Graceful error handling and recovery
 *
 * @example
 * ```javascript
 * // Create and start a crash-proof worker
 * const worker = new LogProcessorWorker(redisClient, repository, retryStrategy, {
 *   streamKey: 'logs:stream',
 *   groupName: 'log-processors',
 *   batchSize: 2000
 * });
 *
 * await worker.start();
 *
 * // Worker runs until stopped
 * // await worker.stop();
 * ```
 */
class LogProcessorWorker {
  /**
   * Create a new LogProcessorWorker instance.
   *
   * @param {Redis} redisClient - Configured Redis client for stream operations
   * @param {Object} repository - Repository for database persistence (must have saveBatch method)
   * @param {RetryStrategy} retryStrategy - Strategy for handling failed batch operations
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.streamKey='logs:stream'] - Redis Stream key
   * @param {string} [options.groupName='log-processors'] - Consumer group name
   * @param {string} [options.consumerName] - Unique consumer name (defaults to worker-{pid})
   * @param {number} [options.batchSize=2000] - Number of logs to read per batch from stream
   * @param {number} [options.maxBatchSize=100000] - Max buffer size before flush
   * @param {number} [options.maxWaitTime=1000] - Max time before flush in ms
   * @param {number} [options.pollInterval=5] - Milliseconds between stream checks
   * @param {boolean} [options.enableLogging=true] - Whether to enable console logging
   */
  constructor(redisClient, repository, retryStrategy, options = {}) {
    if (!redisClient) {
      throw new Error('Redis client is required');
    }
    if (!repository || typeof repository.saveBatch !== 'function') {
      throw new Error('Repository with saveBatch method is required');
    }
    if (!retryStrategy || typeof retryStrategy.queueForRetry !== 'function') {
      throw new Error('Retry strategy with queueForRetry method is required');
    }

    this.redis = redisClient;
    this.repository = repository;
    this.retryStrategy = retryStrategy;

    // Stream configuration
    this.streamKey = options.streamKey || 'logs:stream';
    this.groupName = options.groupName || 'log-processors';
    this.consumerName = options.consumerName || `worker-${process.pid}`;
    this.batchSize = options.batchSize || 2000;
    this.pollInterval = options.pollInterval || 5;
    this.enableLogging = options.enableLogging !== false;

    // Buffer configuration
    this.maxBatchSize = options.maxBatchSize || 100000;
    this.maxWaitTime = options.maxWaitTime || 1000;

    // Worker state
    this.isRunning = false;
    this.isProcessing = false;
    this.streamQueue = null;
    this.batchBuffer = null;
  }

  /**
   * Start the background worker.
   *
   * Initializes the Redis Stream queue, sets up the BatchBuffer with ACK callback,
   * and begins the continuous processing loop. Automatically recovers any pending
   * messages from previous crashed workers.
   *
   * @returns {Promise<void>} Resolves when worker is started
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    if (this.enableLogging) {
      console.log('[LogProcessorWorker] Starting crash-proof worker...');
    }

    // Initialize Redis Stream Queue
    this.streamQueue = new RedisStreamQueue(this.redis, {
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      batchSize: this.batchSize,
      enableLogging: this.enableLogging
    });

    await this.streamQueue.initialize();

    // Initialize BatchBuffer with ACK callback
    this.batchBuffer = new BatchBuffer(this.repository, this.retryStrategy, {
      maxBatchSize: this.maxBatchSize,
      maxWaitTime: this.maxWaitTime,
      enableLogging: this.enableLogging,
      onFlushSuccess: async (flushedLogs) => {
        // ACK the Redis messages after successful DB persistence
        await this._acknowledgeMessages(flushedLogs);
      }
    });

    this.isRunning = true;

    if (this.enableLogging) {
      console.log('[LogProcessorWorker] Worker started:', {
        streamKey: this.streamKey,
        groupName: this.groupName,
        consumerName: this.consumerName,
        batchSize: this.batchSize
      });
    }

    // Start the processing loop
    this.processLoop();
  }

  /**
   * Stop the background worker.
   *
   * Signals the worker to stop processing after completing the current batch.
   * Performs graceful shutdown of BatchBuffer (final flush) and cleans up resources.
   *
   * @returns {Promise<void>} Resolves after shutdown is complete
   */
  async stop() {
    if (this.enableLogging) {
      console.log('[LogProcessorWorker] Stopping worker...');
    }

    this.isRunning = false;

    // Wait for current processing to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Graceful shutdown of buffer (flushes remaining logs)
    if (this.batchBuffer) {
      await this.batchBuffer.shutdown();
    }

    // Shutdown stream queue
    if (this.streamQueue) {
      await this.streamQueue.shutdown();
    }

    if (this.enableLogging) {
      console.log('[LogProcessorWorker] Worker stopped');
    }
  }

  /**
   * Main processing loop that continuously monitors and processes the stream.
   *
   * This method runs indefinitely while the worker is active, reading batches
   * from the Redis Stream and adding them to the BatchBuffer. The buffer
   * automatically flushes based on size/time thresholds.
   *
   * @private
   * @returns {Promise<void>} Never resolves (runs until worker is stopped)
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        await this.processBatch();

        // Brief pause between polling to prevent excessive CPU usage
        if (this.pollInterval > 0) {
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
      } catch (error) {
        console.error('[LogProcessorWorker] Error in process loop:', error);
        // Exponential backoff on errors
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Process a single batch of logs from the Redis Stream.
   *
   * Reads messages from the stream, reconstructs LogEntry domain objects,
   * and adds them to the BatchBuffer with attached Redis message IDs for
   * later acknowledgment.
   *
   * @private
   * @returns {Promise<void>} Resolves when batch processing is complete
   */
  async processBatch() {
    // Prevent concurrent batch processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Read batch of messages from Redis Stream
      const messages = await this.streamQueue.read(this.batchSize);

      if (!messages || messages.length === 0) {
        this.isProcessing = false;
        return;
      }

      // Normalize log data with Redis ID attached for ACK tracking
      const logEntries = messages.map(msg => {
        try {
          const data = msg.data;
          // Use normalize for consistency with validation strategies
          const normalized = LogEntry.normalize(data);
          // Attach Redis message ID for ACK tracking
          normalized._redisId = msg.id;
          return normalized;
        } catch (error) {
          console.error('[LogProcessorWorker] Failed to parse log entry:', error.message);
          // ACK invalid messages to remove them from stream
          this.streamQueue.ack([msg.id]).catch(() => { });
          return null;
        }
      }).filter(entry => entry !== null);

      // Add to BatchBuffer (will flush automatically based on size/time)
      if (logEntries.length > 0) {
        await this.batchBuffer.add(logEntries);

        if (this.enableLogging) {
          console.log(`[LogProcessorWorker] Buffered ${logEntries.length} logs (stream batch: ${this.batchSize})`);
        }
      }

    } catch (error) {
      console.error('[LogProcessorWorker] Batch processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Acknowledge messages in Redis after successful database persistence.
   *
   * Extracts Redis message IDs from flushed logs and sends XACK to Redis.
   * This is the critical step that makes the architecture crash-proof.
   *
   * @private
   * @param {Array<Object>} flushedLogs - Array of log entries that were successfully persisted
   * @returns {Promise<void>}
   */
  async _acknowledgeMessages(flushedLogs) {
    // Extract Redis IDs from flushed logs
    const idsToAck = flushedLogs
      .map(log => log._redisId)
      .filter(id => id != null);

    if (idsToAck.length === 0) {
      return;
    }

    try {
      await this.streamQueue.ack(idsToAck);

      if (this.enableLogging) {
        console.log(`[LogProcessorWorker] Acknowledged ${idsToAck.length} messages to Redis`);
      }
    } catch (error) {
      // Log error but don't throw - data is already in DB
      // Messages will be re-processed on restart (idempotent)
      console.error('[LogProcessorWorker] Failed to ACK messages:', error.message);
    }
  }

  /**
   * Get worker health and metrics.
   *
   * @returns {Object} Health and metrics information
   */
  getHealth() {
    const bufferHealth = this.batchBuffer ? this.batchBuffer.getHealth() : null;

    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      streamKey: this.streamKey,
      consumerName: this.consumerName,
      buffer: bufferHealth
    };
  }

  /**
   * Get pending message count from Redis Stream.
   *
   * @returns {Promise<Object>} Pending info including count and consumers
   */
  async getPendingInfo() {
    if (!this.streamQueue) {
      return { pendingCount: 0, consumers: [] };
    }
    return this.streamQueue.getPendingInfo();
  }
}

module.exports = LogProcessorWorker;
