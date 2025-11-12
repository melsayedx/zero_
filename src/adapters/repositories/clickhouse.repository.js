const LogRepositoryPort = require('../../core/ports/log-repository.port');
const LogEntry = require('../../core/entities/log-entry');

/**
 * ClickHouse Repository with Optimized Performance
 */
class ClickHouseRepository extends LogRepositoryPort {
  constructor(clickhouseClient) {
    super();
    this.client = clickhouseClient;
    this.tableName = process.env.CLICKHOUSE_TABLE || 'logs';

    // Simplified filter configuration for better performance
    this.FILTER_CONFIG = {
      app_id: { type: 'string', indexed: true, required: true },
      timestamp: { type: 'datetime', indexed: true },
      level: { type: 'string', indexed: true },
      source: { type: 'string', indexed: true },
      environment: { type: 'string', indexed: true },
      trace_id: { type: 'string', indexed: true },
      user_id: { type: 'string', indexed: true },
      message: { type: 'string', indexed: false },
      metadata: { type: 'string', indexed: false }
    };
  }

  /**
   * Save log entries to ClickHouse
   * Note: Using async inserts (wait_for_async_insert: 0) for maximum throughput.
   * Data is queued and written asynchronously by ClickHouse.
   * @param {LogEntry[]} logEntries - The log entry array to save
   */
  async save(logEntries) {
    if (!Array.isArray(logEntries) || logEntries.length === 0) {
      throw new Error('logEntries must be a non-empty array');
    }

    const values = logEntries.map(logEntry => logEntry.toObject());
    
    try {
      // Fire-and-forget: ClickHouse queues the data for async insertion
      await this.client.insert({
        table: this.tableName,
        values: values,
        format: 'JSONEachRow'
      });
    } catch (error) {
      console.error('ClickHouse insert error:', {
        error: error.message,
        table: this.tableName,
        recordCount: values.length,
        sampleRecord: values[0] // Log first record for debugging
      });
      throw error;
    }
  }

  /**
   * Save logs with different validation modes for performance
   * @param {Object[]} rawLogs - Raw log data
   * @param {Object} options - Validation options { skipValidation, lightValidation }
   */
  async saveBulk(rawLogs, options = {}) {
    if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
      throw new Error('rawLogs must be a non-empty array');
    }

    const { skipValidation = false, lightValidation = false } = options;

    // Create entities with appropriate validation
    const logEntries = rawLogs.map(data => {
      if (skipValidation) return LogEntry.createUnsafe(data);
      if (lightValidation) return LogEntry.createFast(data);
      return new LogEntry(data);
    });

    await this.save(logEntries);
    return { saved: logEntries.length };
  }

  /**
   * Find logs by filter with performance optimization
   * @param {Object} options
   * @param {Object} options.filter - Filter conditions
   * @param {number} options.limit - Page size
   * @param {Object} options.cursor - Pagination cursor
   * @param {Object} options.sort - Sort options { field, order }
   * @returns {Promise<Object>} { logs, nextCursor, hasMore, queryTime }
   */
  async findBy({ filter = {}, limit = 100, cursor = null, sort = null }) {
    const startTime = Date.now();

    this.validateLimit(limit);

    // Enforce app_id requirement
    if (!filter.app_id) {
      throw new Error('app_id filter is required for query performance');
    }

    // Build query components
    const { whereClause, indexedConditions } = this.buildWhereClause(filter, cursor);
    const orderBy = this.buildOrderBy(sort);
    const fetchLimit = parseInt(limit, 10) + 1;

    // Build optimized query
    const query = this.buildSelectQuery(whereClause, indexedConditions, orderBy, fetchLimit);

    const result = await this.client.query({ query, format: 'JSONEachRow' });

    // Parse results
    const logs = [];
    for await (const row of result.stream()) {
      logs.push({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      });
    }

    // Handle pagination
    const hasMore = logs.length > limit;
    if (hasMore) logs.pop();

    const nextCursor = logs.length > 0 ? {
      timestamp: logs[logs.length - 1].timestamp,
      id: logs[logs.length - 1].id
    } : null;

    const queryTime = Date.now() - startTime;

    return { logs, nextCursor, hasMore, queryTime };
  }

  /**
   * Build WHERE clause with cursor support
   * @private
   */
  buildWhereClause(filter, cursor) {
    const indexedConditions = [];
    const nonIndexedConditions = [];

    // Add filter conditions
    for (const [field, value] of Object.entries(filter)) {
      if (!this.FILTER_CONFIG[field]) {
        throw new Error(`Filter field '${field}' is not allowed`);
      }

      const condition = this.buildSimpleCondition(field, value);
      if (this.FILTER_CONFIG[field].indexed) {
        indexedConditions.push(condition);
      } else {
        nonIndexedConditions.push(condition);
      }
    }

    // Add cursor condition
    if (cursor) {
      if (!cursor.timestamp || !cursor.id) {
        throw new Error('Cursor must include timestamp and id');
      }
      indexedConditions.push(
        `(timestamp, id) < ('${this.escapeString(cursor.timestamp)}', '${this.escapeString(cursor.id)}')`
      );
    }

    const allConditions = [...indexedConditions, ...nonIndexedConditions];
    const whereClause = allConditions.join(' AND ');

    return { whereClause, indexedConditions };
  }

  /**
   * Build order by clause
   * @private
   */
  buildOrderBy(sort) {
    if (!sort) return 'ORDER BY timestamp DESC, id DESC';
    const { field = 'timestamp', order = 'DESC' } = sort;
    return `ORDER BY ${this.escapeIdentifier(field)} ${order.toUpperCase()}`;
  }

  /**
   * Build select query
   * @private
   */
  buildSelectQuery(whereClause, indexedConditions, orderBy, limit) {
    const selectFields = 'id, app_id, timestamp, level, message, source, environment, metadata, trace_id, user_id';

    if (indexedConditions.length > 0) {
      return `
        SELECT ${selectFields}
        FROM ${this.tableName}
        PREWHERE ${indexedConditions.join(' AND ')}
        ${whereClause ? `WHERE ${whereClause}` : ''}
        ${orderBy}
        LIMIT ${limit}
      `;
    } else {
      return `
        SELECT ${selectFields}
        FROM ${this.tableName}
        WHERE ${whereClause}
        ${orderBy}
        LIMIT ${limit}
      `;
    }
  }

  /**
   * Build simple condition (supports =, IN, LIKE)
   * @private
   */
  buildSimpleCondition(field, value) {
    const fieldType = this.FILTER_CONFIG[field].type;

    if (Array.isArray(value)) {
      // IN condition
      const escapedValues = value.map(v => this.escapeValue(v, fieldType)).join(', ');
      return `${this.escapeIdentifier(field)} IN (${escapedValues})`;
    } else if (typeof value === 'object' && value !== null) {
      // Complex condition
      const { operator, value: opValue } = value;
      return this.buildCondition(field, operator, opValue, fieldType);
    } else {
      // Simple equality
      return `${this.escapeIdentifier(field)} = ${this.escapeValue(value, fieldType)}`;
    }
  }

  /**
   * Build complex condition with operator
   * @private
   */
  buildCondition(field, operator, value, type) {
    const escapedField = this.escapeIdentifier(field);
    const upperOp = operator.toUpperCase();

    switch (upperOp) {
      case '=':
      case '!=':
      case '>':
      case '<':
      case '>=':
      case '<=':
        return `${escapedField} ${upperOp} ${this.escapeValue(value, type)}`;

      case 'IN':
        if (!Array.isArray(value)) {
          throw new Error(`IN operator requires array for field '${field}'`);
        }
        const escapedValues = value.map(v => this.escapeValue(v, type)).join(', ');
        return `${escapedField} IN (${escapedValues})`;

      case 'LIKE':
      case 'ILIKE':
        return `${escapedField} ${upperOp} ${this.escapeValue(`%${value}%`, 'string')}`;

      case 'BETWEEN':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error(`BETWEEN requires array of 2 values for field '${field}'`);
        }
        return `${escapedField} BETWEEN ${this.escapeValue(value[0], type)} AND ${this.escapeValue(value[1], type)}`;

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  /**
   * Escape identifier
   * @private
   */
  escapeIdentifier(identifier) {
    return `\`${identifier.replace(/`/g, '')}\``;
  }

  /**
   * Escape string value
   * @private
   */
  escapeString(value) {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Escape and format value
   * @private
   */
  escapeValue(value, type) {
    if (value === null || value === undefined) return 'NULL';

    switch (type) {
      case 'string':
        return `'${this.escapeString(value)}'`;

      case 'datetime':
        let dateStr = value instanceof Date ? value.toISOString() : String(value);
        return `'${dateStr.replace('T', ' ').replace('Z', '')}'`;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
        return String(num);

      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }

  /**
   * Validate limit
   * @private
   */
  validateLimit(limit) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }

  /**
   * Get performance statistics
   * @returns {Promise<Object>} Performance metrics
   */
  async getStats() {
    try {
      const result = await this.client.query({
        query: `
          SELECT
            table,
            formatReadableSize(sum(bytes)) as size,
            sum(rows) as rows,
            max(modification_time) as last_modified
          FROM system.parts
          WHERE database = currentDatabase() AND table = '${this.tableName}'
          GROUP BY table
        `,
        format: 'JSONEachRow'
      });

      const stats = [];
      for await (const row of result.stream()) {
        stats.push(row);
      }

      return {
        table: this.tableName,
        stats: stats[0] || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Health check with detailed info
   * @returns {Promise<Object>} { healthy, latency, version }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      await this.client.ping();
      const latency = Date.now() - startTime;

      // Get version info
      const versionResult = await this.client.query({
        query: 'SELECT version() as version',
        format: 'JSONEachRow'
      });

      let version = 'unknown';
      for await (const row of versionResult.stream()) {
        version = row.version;
        break;
      }

      return {
        healthy: true,
        latency,
        version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Bulk health check
   * @param {string[]} operations - Operations to test
   * @returns {Promise<Object>} Health status for each operation
   */
  async healthCheckBulk(operations = ['read', 'write']) {
    const results = {};

    for (const op of operations) {
      switch (op) {
        case 'read':
          results.read = await this._testReadHealth();
          break;
        case 'write':
          results.write = await this._testWriteHealth();
          break;
        default:
          results[op] = { healthy: false, error: 'Unknown operation' };
      }
    }

    return results;
  }

  /**
   * Test read health
   * @private
   */
  async _testReadHealth() {
    try {
      const result = await this.client.query({
        query: `SELECT count() as count FROM ${this.tableName}`,
        format: 'JSONEachRow'
      });

      for await (const row of result.stream()) {
        return { healthy: true, count: row.count };
      }
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Test write health
   * @private
   */
  async _testWriteHealth() {
    try {
      // Try to insert a test log (will be cleaned up by TTL)
      const testLog = {
        id: 'health-check-' + Date.now(),
        app_id: 'health-check',
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message: 'Health check test',
        source: 'health-check'
      };

      await this.client.insert({
        table: this.tableName,
        values: [testLog],
        format: 'JSONEachRow'
      });

      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

module.exports = ClickHouseRepository;

