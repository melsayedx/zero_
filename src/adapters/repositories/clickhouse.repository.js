const LogRepositoryPort = require('../../core/ports/log-repository.port');

/**
 * ClickHouse Implementation of LogRepository
 * Adapter for storing logs in ClickHouse
 */
class ClickHouseRepository extends LogRepositoryPort {
  constructor(clickhouseClient) {
    super();
    if (!clickhouseClient) {
      throw new Error('ClickHouse client is required');
    }
    this.client = clickhouseClient;
    this.tableName = 'logs';
  }

  /**
   * Save a log entry to ClickHouse
   * @param {LogEntry} logEntry - The log entry to save
   * @returns {Promise<Object>} Saved log entry data
   */
  async save(logEntry) {
    try {
      const logData = logEntry.toObject();
      
      // Convert metadata object to JSON string for storage
      const values = {
        id: logData.id,
        timestamp: this.formatTimestamp(logData.timestamp),
        level: logData.level,
        message: logData.message,
        source: logData.source,
        metadata: JSON.stringify(logData.metadata),
        trace_id: logData.trace_id || '',
        user_id: logData.user_id || ''
      };

      // Insert into ClickHouse
      await this.client.insert({
        table: this.tableName,
        values: [values],
        format: 'JSONEachRow'
      });

      return logData;
    } catch (error) {
      throw new Error(`Failed to save log to ClickHouse: ${error.message}`);
    }
  }

  /**
   * Format timestamp for ClickHouse DateTime64
   * @param {Date} date - JavaScript Date object
   * @returns {string} Formatted timestamp
   */
  formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Health check - verify ClickHouse connection
   * @returns {Promise<boolean>} Connection status
   */
  async healthCheck() {
    try {
      const result = await this.client.query({
        query: 'SELECT 1',
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('ClickHouse health check failed:', error.message);
      return false;
    }
  }
}

module.exports = ClickHouseRepository;

