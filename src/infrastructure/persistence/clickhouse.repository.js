const LogRepositoryContract = require('../../domain/contracts/log-repository.contract');
const InMemoryQueryCache = require('../../infrastructure/cache/in-memory-query.cache');

/**
 * Log repository implementation for ClickHouse with batching and query support.
 * @implements {LogRepositoryContract}
 */
// TODO: refactor jsdoc review
class ClickHouseRepository extends LogRepositoryContract {
  /**
   * @param {Object} client - ClickHouse client.
   * @param {Object} [options] - Config options.
   * @param {string} [options.tableName='logs'] - Table name.
   * @param {QueryCacheContract} [options.queryCache] - Query cache.
   */
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.tableName = options.tableName || 'logs';

    // Note: This repository is stateless - no internal buffer
    // Buffering is handled by LogProcessorWorker for crash-proof processing

    // Filter configuration defines supported fields and their properties
    this.FILTER_CONFIG = new Map([
      ['app_id', { type: 'string', indexed: true, required: true }],
      ['timestamp', { type: 'datetime', indexed: true }],
      ['level', { type: 'string', indexed: true }],
      ['source', { type: 'string', indexed: true }],
      ['environment', { type: 'string', indexed: true }],
      ['trace_id', { type: 'string', indexed: true }],
      ['user_id', { type: 'string', indexed: true }],
      ['message', { type: 'string', indexed: false }],
      ['metadata', { type: 'string', indexed: false }]
    ]);

    // Pre-compile regex patterns for better performance
    this.QUOTE_PATTERN = /'/g;
    this.BACKTICK_PATTERN = /`/g;

    // Query cache - use provided cache or default to in-memory
    this.queryCache = options.queryCache || new InMemoryQueryCache();
    this.logger = options.logger;

    // Health check cache to avoid repeated checks within short intervals
    this.lastHealthCheck = null;
    this.healthCheckCacheTime = 30000; // 30 seconds cache
  }

  /**
   * Direct inserts a batch of logs to ClickHouse.
   * @param {Array<Object>} logs - Normalized logs.
   * @returns {Promise<void>}
   */
  async save(logs) {
    // Convert camelCase (from LogEntry.normalize) to snake_case for ClickHouse
    const values = new Array(logs.length);
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      values[i] = {
        app_id: log.appId,
        message: log.message,
        source: log.source,
        level: log.level,
        environment: log.environment,
        metadata: log.metadataString,  // Pre-serialized JSON string
        trace_id: log.traceId,
        user_id: log.userId
        // id and timestamp omitted - ClickHouse generates automatically
      };
    }

    return await this.client.insert({
      table: this.tableName,
      values: values,
      format: 'JSONEachRow',
      clickhouse_settings: {
        // Async insert settings for optimal performance
        async_insert: 1,
        wait_for_async_insert: 0,

        // Compression for reduced network overhead
        enable_http_compression: 1,
        http_zlib_compression_level: 3,

        // Batch settings optimized for ClickHouse
        max_insert_block_size: Math.min(100000, values.length),
        min_insert_block_size_rows: Math.floor(Math.min(100000, values.length) / 2),
        min_insert_block_size_bytes: 1048576, // 1MB

        // Timeout settings
        max_execution_time: 30,
        send_timeout: 30,
        receive_timeout: 30
      }
    });
  }

  /**
   * Finds logs with optimized filtering and cursor pagination.
   * @param {Object} options - Query options { filter, limit, cursor, sort }.
   * @returns {Promise<Object>} { logs, nextCursor, hasMore, queryTime }.
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
    const query = await this.buildSelectQuery(whereClause, indexedConditions, orderBy, fetchLimit);

    const result = await this.client.query({ query, format: 'JSONEachRow' });

    // Parse results with optimized memory usage
    const logs = [];
    let lastRow = null;
    let rowCount = 0;
    const maxRows = parseInt(limit, 10) + 1; // +1 for pagination detection

    for await (const row of result.stream()) {
      if (rowCount >= maxRows) break; // Early termination for pagination

      const processedRow = {
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      };

      logs.push(processedRow);
      lastRow = processedRow;
      rowCount++;
    }

    // Handle pagination more efficiently
    const hasMore = logs.length > limit;
    if (hasMore) {
      logs.pop(); // Remove the extra row used for pagination detection
      lastRow = logs[logs.length - 1]; // Update lastRow reference
    }

    const nextCursor = lastRow ? {
      timestamp: lastRow.timestamp,
      id: lastRow.id
    } : null;

    const queryTime = Date.now() - startTime;

    return { logs, nextCursor, hasMore, queryTime };
  }

  /**
   * Semantic search using vector embeddings.
   * @param {number[]} queryEmbedding - 384d vector.
   * @param {Object} [options] - Filters { appId, limit, level, timeRange }.
   * @returns {Promise<Array>} Similar logs with scores.
   */
  async findSimilar(queryEmbedding, options = {}) {
    const { appId, limit = 20, level, timeRange } = options;

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error('Query embedding is required');
    }

    // Build embedding array string for ClickHouse
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build WHERE conditions for filtering
    const conditions = [];

    if (appId) {
      conditions.push(`e.app_id = '${this.escapeString(appId)}'`);
    }

    if (level && Array.isArray(level) && level.length > 0) {
      const levels = level.map(l => `'${this.escapeString(l)}'`).join(',');
      conditions.push(`l.level IN (${levels})`);
    }

    if (timeRange) {
      if (timeRange.start) {
        conditions.push(`e.timestamp >= '${this.escapeString(timeRange.start)}'`);
      }
      if (timeRange.end) {
        conditions.push(`e.timestamp <= '${this.escapeString(timeRange.end)}'`);
      }
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Query using cosineDistance with JOIN to get full log data
    const query = `
      SELECT 
        l.id,
        l.app_id,
        l.timestamp,
        l.level,
        l.message,
        l.source,
        l.environment,
        l.metadata,
        l.trace_id,
        l.user_id,
        e.embedded_text,
        cosineDistance(e.embedding, ${embeddingStr}) AS distance
      FROM logs_db.log_embeddings e
      INNER JOIN ${this.tableName} l ON e.log_id = l.id
      ${whereClause}
      ORDER BY distance ASC
      LIMIT ${parseInt(limit, 10)}
    `;

    const result = await this.client.query({ query, format: 'JSONEachRow' });

    const logs = [];
    for await (const row of result.stream()) {
      logs.push({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        similarity: 1 - row.distance // Convert distance to similarity (0-1)
      });
    }

    return logs;
  }


  /**
   * Builds optimized WHERE clause with pagination cursor.
   * @private
   */
  buildWhereClause(filter, cursor) {
    const indexedConditions = [];
    const nonIndexedConditions = [];

    // Add filter conditions with optimized Map lookups
    for (const [field, value] of Object.entries(filter)) {
      const fieldConfig = this.FILTER_CONFIG.get(field);
      if (!fieldConfig) {
        throw new Error(`Filter field '${field}' is not allowed`);
      }

      const condition = this.buildSimpleCondition(field, value);
      if (fieldConfig.indexed) {
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
   * Builds ORDER BY clause (default: timestamp DESC, id DESC).
   * @private
   */
  buildOrderBy(sort) {
    if (!sort) return 'ORDER BY timestamp DESC, id DESC';
    const { field = 'timestamp', order = 'DESC' } = sort;
    return `ORDER BY ${this.escapeIdentifier(field)} ${order.toUpperCase()}`;
  }

  /**
   * Builds/caches SELECT query with PREWHERE optimization.
   * @private
   */
  async buildSelectQuery(whereClause, indexedConditions, orderBy, limit) {
    // Create cache key from query components
    const cacheKey = `${indexedConditions.length > 0 ? 'prewhere' : 'where'}:${orderBy}:${limit}`;

    // Check cache first for performance
    const cachedTemplate = await this.queryCache.get(cacheKey);
    if (cachedTemplate) {
      // Fill in dynamic parts
      return indexedConditions.length > 0
        ? cachedTemplate
          .replace('__INDEXED_CONDITIONS__', indexedConditions.join(' AND '))
          .replace('__WHERE_CLAUSE__', whereClause || '')
          .replace('__ORDER_BY__', orderBy)
          .replace('__LIMIT__', limit)
        : cachedTemplate
          .replace('__WHERE_CLAUSE__', whereClause)
          .replace('__ORDER_BY__', orderBy)
          .replace('__LIMIT__', limit);
    }

    // Build and cache query template
    const selectFields = 'id, app_id, timestamp, level, message, source, environment, metadata, trace_id, user_id';
    let queryTemplate;

    if (indexedConditions.length > 0) {
      queryTemplate = `
        SELECT ${selectFields}
        FROM ${this.tableName}
        PREWHERE __INDEXED_CONDITIONS__
        ${whereClause ? 'WHERE __WHERE_CLAUSE__' : ''}
        __ORDER_BY__
        LIMIT __LIMIT__
      `.trim();
    } else {
      queryTemplate = `
        SELECT ${selectFields}
        FROM ${this.tableName}
        WHERE __WHERE_CLAUSE__
        __ORDER_BY__
        LIMIT __LIMIT__
      `.trim();
    }

    // Cache the template asynchronously (non-blocking)
    await this.queryCache.set(cacheKey, queryTemplate);

    // Return filled template
    return indexedConditions.length > 0
      ? queryTemplate
        .replace('__INDEXED_CONDITIONS__', indexedConditions.join(' AND '))
        .replace('__WHERE_CLAUSE__', whereClause || '')
        .replace('__ORDER_BY__', orderBy)
        .replace('__LIMIT__', limit)
      : queryTemplate
        .replace('__WHERE_CLAUSE__', whereClause)
        .replace('__ORDER_BY__', orderBy)
        .replace('__LIMIT__', limit);
  }


  /**
   * Builds simple field condition (equality or IN).
   * @private
   */
  buildSimpleCondition(field, value) {
    const fieldType = this.FILTER_CONFIG.get(field).type;

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
   * Builds complex condition with operators.
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
   * Escapes SQL identifier.
   * @private
   */
  escapeIdentifier(identifier) {
    return `\`${identifier.replace(this.BACKTICK_PATTERN, '')}\``;
  }

  /**
   * Escapes string value.
   * @private
   */
  escapeString(value) {
    return String(value).replace(this.QUOTE_PATTERN, "''");
  }

  /**
   * Formats and escapes value by type.
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
   * Validates query limit (1-1000).
   * @private
   */
  validateLimit(limit) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }

  /**
   * Gets table and performance stats.
   * @returns {Promise<Object>} { table, stats, timestamp }.
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
      try {
        for await (const row of result.stream()) {
          stats.push(row);
        }
      } catch (error) {
        if (error.code === 'ABORT_ERR' || error.name === 'AbortError') {
          this.logger.warn('Stats query stream aborted');
          // Return partial stats if available
        } else {
          throw error;
        }
      }

      return {
        table: this.tableName,
        stats: stats[0] || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async healthCheck() {
    const now = Date.now();

    // Return cached result if within cache time window
    if (this.lastHealthCheck &&
      (now - this.lastHealthCheck.timestamp) < this.healthCheckCacheTime) {
      return {
        ...this.lastHealthCheck.result,
        cached: true,
        timestamp: new Date().toISOString()
      };
    }

    const startTime = now;

    try {
      // Test basic connectivity with ping
      await this.client.ping();
      const pingLatency = Date.now() - startTime;

      // Test database accessibility with a simple command
      await this.client.command({
        query: 'SELECT 1',
        clickhouse_settings: {
          max_execution_time: 5  // 5 second timeout for health check
        }
      });

      const result = {
        healthy: true,
        latency: Date.now() - startTime,
        pingLatency,
        version: 'ClickHouse',
        timestamp: new Date().toISOString()
      };

      // Cache successful result
      this.lastHealthCheck = {
        result,
        timestamp: now
      };

      return result;
    } catch (error) {
      const result = {
        healthy: false,
        error: error.message,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // Cache failed result for shorter time (5 seconds)
      this.lastHealthCheck = {
        result,
        timestamp: now
      };
      this.healthCheckCacheTime = 5000; // Reduce cache time for failures

      return result;
    }
  }
}

module.exports = ClickHouseRepository;

