const LogRepositoryContract = require('../../domain/contracts/log-repository.contract');

/**
 * Log ingestion repository using Redis Streams (fire-and-forget).
 * @implements {LogRepositoryContract}
 */
class RedisLogRepository extends LogRepositoryContract {
  /**
   * @param {Redis} client - Redis client.
   * @param {Object} [options] - Config options.
   * @param {string} [options.queueKey='logs:stream'] - Redis stream key.
   */
  constructor(client, options = {}) {
    super();

    this.client = client;
    // Reliable stream for crash-proof processing (matches LogProcessorWorker)
    this.streamKey = options.streamKey || options.queueKey || 'logs:stream';
    this.logger = options.logger;
  }

  async save(logEntries) {
    if (logEntries.length === 0) {
      return;
    }

    try {
      // Serialize and pipeline XADD operations
      // Pipelining reduces network RTT overhead significantly
      const pipeline = this.client.pipeline();

      this.logger.debug('Saving log entries to Redis stream', { count: logEntries.length });

      for (let i = 0; i < logEntries.length; i++) {
        pipeline.xadd(this.streamKey, 'MAXLEN', '~', '1000000', '*', 'data', JSON.stringify(logEntries[i]));
      }

      await pipeline.exec();

    } catch (error) {
      this.logger.error('Failed to add logs to stream', { error: error.message });
      throw new Error('Failed to queue logs for processing');
    }
  }

  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      return {
        healthy: true,
        latency: Date.now() - start,
        version: 'Redis'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async getStats() {
    const length = await this.client.xlen(this.streamKey);
    return {
      streamLength: length,
      streamKey: this.streamKey
    };
  }

  /**
   * Not supported for ingestion-only repository.
   * @throws {Error} Always throws.
   */
  async findBy() {
    throw new Error('RedisLogRepository does not support querying logs. Use Other Repositories');
  }
}

module.exports = RedisLogRepository;
