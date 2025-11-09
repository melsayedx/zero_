/**
 * ClickHouse Storage Service
 * Handles all ClickHouse operations for log storage and querying
 */

const { getClickHouseClient } = require('../../config/clickhouse.config');
const { queries, buildFilterClause } = require('../../models/clickhouse/logs.schema');
const logger = require('../../utils/logger');
const performanceMonitor = require('../../utils/performance-monitor');

class ClickHouseService {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize service
   */
  async init() {
    try {
      this.client = getClickHouseClient();
      logger.info('ClickHouse service initialized');
    } catch (error) {
      logger.error('Failed to initialize ClickHouse service', { error: error.message });
      throw error;
    }
  }

  /**
   * Insert batch of logs (high-performance bulk insert)
   * @param {Array} logs - Array of log entries
   * @returns {Promise<Object>} Insert result
   */
  async insertLogs(logs) {
    const timer = performanceMonitor.createTimer('clickhouse:insertLogs');
    
    try {
      // Transform logs to ClickHouse format
      const formattedLogs = logs.map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        service: log.service,
        metadata: log.metadata || {},
        host: log.source?.host || '',
        environment: log.source?.environment || 'production',
        trace_id: log.trace_id || '',
        span_id: log.span_id || ''
      }));

      // Use JSONEachRow format for bulk insert (fastest method)
      await this.client.insert({
        table: 'logs',
        values: formattedLogs,
        format: 'JSONEachRow'
      });

      const duration = timer();
      
      logger.query('clickhouse', 'insert', duration, { count: logs.length });
      performanceMonitor.trackIngestion(logs.length, duration);

      return {
        success: true,
        count: logs.length,
        duration
      };
    } catch (error) {
      timer();
      logger.error('ClickHouse insert error', { 
        error: error.message,
        count: logs.length 
      });
      throw error;
    }
  }

  /**
   * Query logs with filters
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Query results
   */
  async queryLogs(params) {
    const timer = performanceMonitor.createTimer('clickhouse:queryLogs');
    
    try {
      const {
        timeRange,
        service,
        level,
        search,
        host,
        environment,
        limit = 100,
        offset = 0
      } = params;

      // Build filter clauses
      const filters = buildFilterClause({ service, level, host, environment, search });

      // Execute query
      const resultSet = await this.client.query({
        query: `
          SELECT 
            timestamp,
            level,
            message,
            service,
            metadata,
            host,
            environment,
            trace_id,
            span_id
          FROM logs
          WHERE timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
            ${filters}
          ORDER BY timestamp DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
        format: 'JSONEachRow'
      });

      const logs = await resultSet.json();
      const duration = timer();
      
      logger.query('clickhouse', 'select', duration, { count: logs.length });
      performanceMonitor.trackQuery(duration, false);

      return {
        logs,
        count: logs.length,
        limit,
        offset
      };
    } catch (error) {
      timer();
      logger.error('ClickHouse query error', { error: error.message });
      throw error;
    }
  }

  /**
   * Count logs with filters
   * @param {Object} params - Query parameters
   * @returns {Promise<number>} Total count
   */
  async countLogs(params) {
    try {
      const { timeRange, service, level, host, environment, search } = params;
      const filters = buildFilterClause({ service, level, host, environment, search });

      const resultSet = await this.client.query({
        query: `
          SELECT count() as total
          FROM logs
          WHERE timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
            ${filters}
        `,
        format: 'JSONEachRow'
      });

      const result = await resultSet.json();
      return result[0]?.total || 0;
    } catch (error) {
      logger.error('ClickHouse count error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get log level distribution
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Level distribution
   */
  async getLogsByLevel(params) {
    try {
      const { timeRange, service } = params;
      const filters = service ? `AND service = '${service}'` : '';

      const resultSet = await this.client.query({
        query: `
          SELECT 
            level,
            count() as count
          FROM logs
          WHERE timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
            ${filters}
          GROUP BY level
          ORDER BY count DESC
        `,
        format: 'JSONEachRow'
      });

      return await resultSet.json();
    } catch (error) {
      logger.error('ClickHouse logs by level error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get logs by service
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Service distribution
   */
  async getLogsByService(params) {
    try {
      const { timeRange } = params;

      const resultSet = await this.client.query({
        query: `
          SELECT 
            service,
            count() as count,
            countIf(level = 'ERROR') as errors,
            countIf(level = 'WARN') as warnings
          FROM logs
          WHERE timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
          GROUP BY service
          ORDER BY count DESC
        `,
        format: 'JSONEachRow'
      });

      return await resultSet.json();
    } catch (error) {
      logger.error('ClickHouse logs by service error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get time series data
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Time series data
   */
  async getTimeSeries(params) {
    try {
      const { timeRange, interval = '1 minute', service, level } = params;
      const filters = buildFilterClause({ service, level });

      const resultSet = await this.client.query({
        query: `
          SELECT 
            toStartOfInterval(timestamp, INTERVAL ${interval}) as time,
            count() as count
          FROM logs
          WHERE timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
            ${filters}
          GROUP BY time
          ORDER BY time
        `,
        format: 'JSONEachRow'
      });

      return await resultSet.json();
    } catch (error) {
      logger.error('ClickHouse time series error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get logs by trace ID
   * @param {string} traceId - Trace ID
   * @returns {Promise<Array>} Logs with matching trace ID
   */
  async getLogsByTraceId(traceId) {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT 
            timestamp,
            level,
            message,
            service,
            span_id,
            metadata
          FROM logs
          WHERE trace_id = '${traceId}'
          ORDER BY timestamp ASC
        `,
        format: 'JSONEachRow'
      });

      return await resultSet.json();
    } catch (error) {
      logger.error('ClickHouse trace query error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get top errors
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Top error messages
   */
  async getTopErrors(params) {
    try {
      const { timeRange, limit = 10 } = params;

      const resultSet = await this.client.query({
        query: `
          SELECT 
            message,
            service,
            count() as occurrences,
            max(timestamp) as last_seen
          FROM logs
          WHERE level IN ('ERROR', 'FATAL')
            AND timestamp BETWEEN parseDateTimeBestEffort('${timeRange.start}') 
                              AND parseDateTimeBestEffort('${timeRange.end}')
          GROUP BY message, service
          ORDER BY occurrences DESC
          LIMIT ${limit}
        `,
        format: 'JSONEachRow'
      });

      return await resultSet.json();
    } catch (error) {
      logger.error('ClickHouse top errors error', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute custom query
   * @param {string} query - SQL query
   * @returns {Promise<Array>} Query results
   */
  async executeQuery(query) {
    const timer = performanceMonitor.createTimer('clickhouse:customQuery');
    
    try {
      const resultSet = await this.client.query({
        query,
        format: 'JSONEachRow'
      });

      const results = await resultSet.json();
      timer();
      
      return results;
    } catch (error) {
      timer();
      logger.error('ClickHouse custom query error', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ClickHouseService();

