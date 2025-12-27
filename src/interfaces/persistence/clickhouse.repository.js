const LogRepositoryContract = require('../../domain/contracts/log-repository.contract');
const InMemoryQueryCache = require('../../infrastructure/cache/in-memory-query.cache');

/**
 * ClickHouse Repository - High-performance log storage with intelligent batching.
 *
 * This repository implements the LogRepositoryPort interface with ClickHouse-specific
 * optimizations for high-throughput log ingestion and efficient querying. It uses an
 * intelligent batch buffer to accumulate logs and flush them in large batches, dramatically
 * reducing database load while maintaining low-latency ingestion.
 *
 * Key features:
 * - Intelligent batching with configurable size/time thresholds
 * - Optimized query building with PREWHERE clauses for indexed fields
 * - Automatic field escaping and type handling
 * - Health monitoring and performance metrics
 * - Cursor-based pagination for efficient log retrieval
 * - Pluggable query cache (in-memory or distributed)
 *
 * The repository enforces app_id as a required filter for query performance and supports
 * complex filtering with operators (=, !=, >, <, >=, <=, IN, LIKE, BETWEEN).
 *
 * @example
 * ```javascript
 * // Create repository with custom cache
 * const cache = new RedisQueryCache(redisClient, { prefix: 'logs:cache' });
 * const repo = new ClickHouseRepository(client, { queryCache: cache });
 *
 * // Query logs with filtering and pagination
 * const result = await repo.findBy({
 *   filter: { app_id: 'my-app', level: 'ERROR' },
 *   limit: 100
 * });
 * ```
 */
class ClickHouseRepository extends LogRepositoryContract {
  /**
   * Create a new ClickHouse repository instance.
   *
   * @param {Object} client - ClickHouse client instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.tableName='logs'] - ClickHouse table name
   * @param {QueryCacheContract} [options.queryCache] - Query cache (defaults to InMemoryQueryCache)
   *
   * @example
   * ```javascript
   * const repo = new ClickHouseRepository(client, {
   *   tableName: 'application_logs',
   *   queryCache: new RedisQueryCache(redisClient)
   * });
   * ```
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
   * Save a batch of log entries directly to ClickHouse (called by BatchBuffer).
   *
   * Converts normalized log entries (with primitives from LogEntry.normalize())
   * to ClickHouse format and performs optimized batch insertion.
   *
   * @param {Array<Object>} logs - Normalized log entries from BatchBuffer
   * @returns {Promise<void>} Resolves when batch is successfully inserted
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
   * Find logs by filter with optimized query performance.
   *
   * Performs efficient log retrieval with automatic query optimization. Uses PREWHERE clauses
   * for indexed fields and enforces app_id as a required filter for performance. Supports
   * cursor-based pagination for efficient large result sets.
   *
   * @param {Object} options - Query options
   * @param {Object} [options.filter={}] - Filter conditions (app_id required)
   * @param {number} [options.limit=100] - Maximum results to return (1-1000)
   * @param {Object} [options.cursor=null] - Pagination cursor { timestamp, id }
   * @param {Object} [options.sort=null] - Sort options { field, order }
   * @returns {Promise<Object>} Query results with pagination info
   * @returns {Array} return.logs - Array of log objects with parsed metadata
   * @returns {Object|null} return.nextCursor - Cursor for next page { timestamp, id }
   * @returns {boolean} return.hasMore - Whether more results are available
   * @returns {number} return.queryTime - Query execution time in milliseconds
   * @throws {Error} If app_id filter is missing or invalid filter/limit provided
   *
   * @example
   * ```javascript
   * // Query logs with advanced filtering and pagination
   * const result = await repo.findBy({
   *   filter: {
   *     app_id: 'my-app',
   *     level: { operator: 'IN', value: ['ERROR', 'WARN'] },
   *     timestamp: { operator: '>', value: '2024-01-01' }
   *   },
   *   limit: 100,
   *   sort: { field: 'timestamp', order: 'DESC' }
   * });
   * ```
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
   * Build WHERE clause with cursor-based pagination support.
   *
   * Constructs optimized WHERE conditions by separating indexed and non-indexed fields.
   * Indexed fields are prioritized for better query performance. Adds cursor conditions
   * for efficient pagination using (timestamp, id) tuple comparison.
   *
   * @private
   * @param {Object} filter - Filter conditions object
   * @param {Object} [cursor] - Pagination cursor { timestamp, id }
   * @returns {Object} Where clause components
   * @returns {string} return.whereClause - Combined WHERE clause string
   * @returns {Array} return.indexedConditions - Array of indexed field conditions
   * @throws {Error} If filter contains invalid fields or cursor is malformed
   *
   * @example
   * ```javascript
   * const { whereClause, indexedConditions } = this.buildWhereClause(
   *   { app_id: 'my-app', level: 'ERROR' },
   *   { timestamp: '2024-01-01 12:00:00', id: 'uuid-123' }
   * );
   * // whereClause: "app_id = 'my-app' AND level = 'ERROR' AND (timestamp, id) < ('2024-01-01 12:00:00', 'uuid-123')"
   * // indexedConditions: ["app_id = 'my-app'", "level = 'ERROR'", "(timestamp, id) < (...)"]
   * ```
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
   * Build ORDER BY clause with default sorting.
   *
   * Creates ORDER BY clause for query sorting. Defaults to timestamp DESC, id DESC
   * for consistent pagination behavior. Supports custom field and order specification.
   *
   * @private
   * @param {Object} [sort] - Sort options { field, order }
   * @param {string} [sort.field='timestamp'] - Field to sort by
   * @param {string} [sort.order='DESC'] - Sort order (ASC/DESC)
   * @returns {string} ORDER BY clause
   *
   * @example
   * ```javascript
   * this.buildOrderBy(); // "ORDER BY timestamp DESC, id DESC"
   * this.buildOrderBy({ field: 'level', order: 'ASC' }); // "ORDER BY level ASC"
   * ```
   */
  buildOrderBy(sort) {
    if (!sort) return 'ORDER BY timestamp DESC, id DESC';
    const { field = 'timestamp', order = 'DESC' } = sort;
    return `ORDER BY ${this.escapeIdentifier(field)} ${order.toUpperCase()}`;
  }

  /**
   * Get cached query or build optimized SELECT query with PREWHERE optimization.
   *
   * Constructs the final SELECT query using ClickHouse optimizations. When indexed
   * conditions are present, uses PREWHERE clause to filter data before WHERE clause
   * processing, significantly improving query performance for large datasets.
   *
   * Uses query caching for repeated patterns to reduce query building overhead.
   *
   * @private
   * @param {string} whereClause - WHERE clause conditions
   * @param {Array} indexedConditions - Array of indexed field conditions
   * @param {string} orderBy - ORDER BY clause
   * @param {number} limit - LIMIT value (includes +1 for pagination detection)
   * @returns {string} Complete SELECT query string
   *
   * @example
   * ```javascript
   * const query = this.buildSelectQuery(
   *   "app_id = 'my-app'",
   *   ["app_id = 'my-app'", "level = 'ERROR'"],
   *   "ORDER BY timestamp DESC, id DESC",
   *   101
   * );
   * // Uses PREWHERE for indexed conditions when available
   * ```
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
   * Build simple condition for field-value pairs.
   *
   * Creates SQL conditions for basic filtering operations. Supports equality,
   * IN arrays, and complex operator objects for advanced filtering.
   *
   * @private
   * @param {string} field - Field name to filter on
   * @param {*} value - Filter value (string, number, array, or operator object)
   * @returns {string} SQL condition string
   * @throws {Error} If field is not in FILTER_CONFIG
   *
   * @example
   * ```javascript
   * this.buildSimpleCondition('level', 'ERROR'); // "level = 'ERROR'"
   * this.buildSimpleCondition('level', ['ERROR', 'WARN']); // "level IN ('ERROR', 'WARN')"
   * this.buildSimpleCondition('message', { operator: 'LIKE', value: 'error' }); // "message LIKE '%error%'"
   * ```
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
   * Build complex condition with explicit operator.
   *
   * Creates SQL conditions for advanced filtering operations including comparison
   * operators, IN clauses, LIKE patterns, and BETWEEN ranges with proper value escaping.
   *
   * @private
   * @param {string} field - Field name
   * @param {string} operator - SQL operator (=, !=, >, <, >=, <=, IN, LIKE, ILIKE, BETWEEN)
   * @param {*} value - Filter value
   * @param {string} type - Field type (string, datetime, number)
   * @returns {string} SQL condition with escaped values
   * @throws {Error} If operator is unsupported or value format is invalid
   *
   * @example
   * ```javascript
   * this.buildCondition('level', 'IN', ['ERROR', 'WARN'], 'string');
   * // "level IN ('ERROR', 'WARN')"
   * ```
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
   * Escape SQL identifier to prevent injection.
   *
   * Wraps identifiers in backticks and removes any existing backticks to ensure
   * safe SQL generation. Uses precompiled regex for better performance.
   *
   * @private
   * @param {string} identifier - Raw identifier string
   * @returns {string} Escaped identifier wrapped in backticks
   *
   * @example
   * ```javascript
   * this.escapeIdentifier('user`id'); // "`userid`" (backticks removed)
   * ```
   */
  escapeIdentifier(identifier) {
    return `\`${identifier.replace(this.BACKTICK_PATTERN, '')}\``;
  }

  /**
   * Escape string value for SQL safety.
   *
   * Doubles single quotes to escape them in SQL strings, preventing injection attacks.
   * Uses precompiled regex for better performance.
   *
   * @private
   * @param {string} value - Raw string value
   * @returns {string} SQL-safe escaped string
   *
   * @example
   * ```javascript
   * this.escapeString("It's working"); // "It''s working"
   * ```
   */
  escapeString(value) {
    return String(value).replace(this.QUOTE_PATTERN, "''");
  }

  /**
   * Escape and format value based on its data type.
   *
   * Converts values to their appropriate SQL representation with proper escaping
   * for strings and type-specific formatting for dates and numbers.
   *
   * @private
   * @param {*} value - Raw value to escape
   * @param {string} type - Data type (string, datetime, number)
   * @returns {string} SQL-formatted and escaped value
   * @throws {Error} If type is unsupported or number is invalid
   *
   * @example
   * ```javascript
   * this.escapeValue('test', 'string'); // "'test'"
   * ```
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
   * Validate query limit parameter.
   *
   * Ensures limit is within acceptable bounds (1-1000) for performance and memory safety.
   *
   * @private
   * @param {number} limit - Limit value to validate
   * @throws {Error} If limit is not between 1 and 1000
   *
   * @example
   * ```javascript
   * this.validateLimit(100); // OK
   * ```
   */
  validateLimit(limit) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }

  /**
   * Get comprehensive performance statistics.
   *
   * Retrieves table statistics from ClickHouse system tables and includes batch buffer
   * metrics for complete performance monitoring. Returns data size, row counts, and
   * buffer performance information.
   *
   * @returns {Promise<Object>} Performance statistics
   * @returns {string} return.table - Table name
   * @returns {Object|null} return.stats - Table statistics from ClickHouse
   * @returns {Object} return.buffer - Batch buffer performance metrics
   * @returns {string} return.timestamp - ISO timestamp of when stats were collected
   *
   * @example
   * ```javascript
   * const stats = await repo.getStats();
   * console.log(`Table size: ${stats.stats?.size || 'unknown'}`);
   * console.log(`Buffer pending: ${stats.buffer.pendingCount} items`);
   * ```
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

  // Note: Buffer-related methods (getBufferMetrics, getBufferHealth, flushBuffer)
  // have been removed. Buffer logic is now in LogProcessorWorker for crash-proof processing.
  // Use worker.getHealth() for buffer metrics.

  // Note: shutdown() has been removed - this repository is stateless.
  // Graceful shutdown is handled by LogProcessorWorker.stop() which
  // flushes its BatchBuffer and acknowledges Redis messages.

  /**
   * Clear the query cache.
   *
   * Useful for testing or when schema changes might invalidate cached queries.
   *
   * @returns {Promise<void>}
   *
   * @example
   * ```javascript
   * // Clear cache after schema changes
   * await repo.clearQueryCache();
   * ```
   */
  async clearQueryCache() {
    await this.queryCache.clear();
  }

  /**
   * Perform comprehensive health check of ClickHouse connection.
   *
   * Tests connectivity, measures latency, and verifies database accessibility.
   * Used for monitoring and load balancer health checks. Results are cached
   * for 30 seconds to reduce load on the database during frequent health checks.
   *
   * @returns {Promise<Object>} Health check results
   * @returns {boolean} return.healthy - Whether service is healthy
   * @returns {number} return.latency - Total latency in milliseconds
   * @returns {number} return.pingLatency - Ping latency in milliseconds
   * @returns {string} return.version - Service version identifier
   * @returns {string} [return.error] - Error message if unhealthy
   * @returns {string} return.timestamp - ISO timestamp of health check
   * @returns {boolean} [return.cached] - Whether result came from cache
   *
   * @example
   * ```javascript
   * const health = await repo.healthCheck();
   * if (!health.healthy) {
   *   console.error('ClickHouse health check failed:', health.error);
   *   // Trigger alerts or failover
   * }
   * ```
   */
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

/**
 * @typedef {ClickHouseRepository} ClickHouseRepository
 * @property {Object} client - ClickHouse client instance
 * @property {string} tableName - ClickHouse table name
 * @property {Map} FILTER_CONFIG - Field configuration for filtering (optimized Map)
 * @property {RegExp} QUOTE_PATTERN - Precompiled regex for quote escaping
 * @property {RegExp} BACKTICK_PATTERN - Precompiled regex for backtick escaping
 * @property {InMemoryQueryCache|RedisQueryCache} queryCache - Query template cache (in-memory or Redis)
 * @property {Object|null} lastHealthCheck - Cached health check result
 * @property {number} healthCheckCacheTime - Health check cache duration in milliseconds
 */
module.exports = ClickHouseRepository;

