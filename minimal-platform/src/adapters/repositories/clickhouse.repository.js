/**
 * ClickHouse Repository Implementation
 * Concrete implementation of LogRepositoryPort for ClickHouse
 */

const LogRepositoryPort = require('../../core/ports/log-repository.port');

class ClickHouseRepository extends LogRepositoryPort {
  constructor(client) {
    super();
    this.client = client;
  }

  /**
   * Save log entry to ClickHouse
   * @param {LogEntry} logEntry 
   */
  async save(logEntry) {
    const data = logEntry.toJSON();
    
    await this.client.insert({
      table: 'logs',
      values: [{
        timestamp: data.timestamp,
        level: data.level,
        message: data.message,
        service: data.service,
        metadata: JSON.stringify(data.metadata)
      }],
      format: 'JSONEachRow'
    });
  }

  /**
   * Find logs by criteria
   * @param {Object} criteria 
   */
  async find(criteria) {
    const { service, level, startTime, endTime, limit = 100 } = criteria;
    
    let query = 'SELECT * FROM logs WHERE 1=1';
    
    if (service) {
      query += ` AND service = '${service}'`;
    }
    
    if (level) {
      query += ` AND level = '${level}'`;
    }
    
    if (startTime && endTime) {
      query += ` AND timestamp BETWEEN '${startTime}' AND '${endTime}'`;
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ${limit}`;
    
    const result = await this.client.query({
      query,
      format: 'JSONEachRow'
    });
    
    return await result.json();
  }
}

module.exports = ClickHouseRepository;

