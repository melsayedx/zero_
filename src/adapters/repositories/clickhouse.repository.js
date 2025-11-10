const LogRepositoryPort = require('../../core/ports/log-repository.port');

/**
 * ClickHouse Implementation of LogRepository
 * 
 * This is a SECONDARY ADAPTER that implements the LogRepositoryPort (output port)
 * It provides the concrete implementation for storing logs in ClickHouse
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
        app_id: logData.app_id,
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
   * Save multiple log entries in batch (optimized for performance)
   * @param {LogEntry[]} logEntries - Array of log entries to save
   * @returns {Promise<Object>} Results with count of saved logs
   */
  async saveBatch(logEntries) {
    try {
      if (!Array.isArray(logEntries) || logEntries.length === 0) {
        throw new Error('logEntries must be a non-empty array');
      }

      const values = logEntries.map(logEntry => {
        const logData = logEntry.toObject();
        return {
          id: logData.id,
          app_id: logData.app_id,
          timestamp: this.formatTimestamp(logData.timestamp),
          level: logData.level,
          message: logData.message,
          source: logData.source,
          metadata: JSON.stringify(logData.metadata),
          trace_id: logData.trace_id || '',
          user_id: logData.user_id || ''
        };
      });

      // Batch insert into ClickHouse
      await this.client.insert({
        table: this.tableName,
        values: values,
        format: 'JSONEachRow'
      });

      return {
        inserted: values.length,
        app_ids: [...new Set(values.map(v => v.app_id))]
      };
    } catch (error) {
      throw new Error(`Failed to batch save logs to ClickHouse: ${error.message}`);
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

