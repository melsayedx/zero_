/**
 * ClickHouse Repository with Dynamic Filtering
 */
class ClickHouseRepository extends LogRepositoryPort {
  constructor(clickhouseClient) {
    super();
    this.client = clickhouseClient;
    this.tableName = 'logs';
    
    this.ALLOWED_FILTERS = {
      app_id: { 
        type: 'string', 
        operators: ['=', 'IN'], 
        indexed: true,
        required: true
      },
      timestamp: { 
        type: 'datetime', 
        operators: ['=', '>', '<', '>=', '<=', 'BETWEEN'], 
        indexed: true
      },
      
      // Indexed via LowCardinality or data skipping index
      level: { 
        type: 'string', 
        operators: ['=', 'IN'], 
        indexed: true  // LowCardinality provides indexing
      },
      source: { 
        type: 'string', 
        operators: ['=', 'IN', 'LIKE'], 
        indexed: true  // LowCardinality
      },
      environment: { 
        type: 'string', 
        operators: ['=', 'IN'], 
        indexed: true  // LowCardinality
      },
      
      // Indexed via bloom filter (data skipping index)
      trace_id: { 
        type: 'string', 
        operators: ['=', '!='], 
        indexed: true  // Bloom filter index
      },
      user_id: { 
        type: 'string', 
        operators: ['=', '!='], 
        indexed: true  // Bloom filter index
      },
      
      // Non-indexed columns (full scan within app_id scope)
      message: { 
        type: 'string', 
        operators: ['LIKE', 'ILIKE', '='], 
        indexed: false
      },
      metadata: { 
        type: 'string', 
        operators: ['LIKE', 'ILIKE'], 
        indexed: false
      }
    };
  }

  /**
   * Find logs by filter (app_id required)
   * @param {Object} options
   * @param {Object} options.filter - Filter conditions
   * @param {number} options.limit - Page size
   * @param {Object} options.cursor - Pagination cursor
   * @returns {Promise<Object>} { logs, nextCursor, hasMore }
   */
  async findByCursor({ filter = {}, limit = 100, cursor = null }) {
    try {
      this.validateLimit(limit);
      
      // Enforce app_id requirement
      if (!filter.app_id) {
        throw new Error('app_id filter is required for query performance');
      }
      
      // Validate filters and separate indexed vs non-indexed
      const { indexedConditions, nonIndexedConditions } = 
        this.buildOptimizedWhereConditions(filter);
      
      // Add cursor condition (indexed)
      if (cursor) {
        if (!cursor.timestamp || !cursor.id) {
          throw new Error('Cursor must include timestamp and id');
        }
        indexedConditions.push(
          `(timestamp, id) < ('${this.escapeValue(cursor.timestamp, 'datetime')}', '${this.escapeValue(cursor.id, 'string')}')`
        );
      }
      
      // Build WHERE clause with indexed filters first
      const whereClause = [
        ...indexedConditions,
        ...nonIndexedConditions
      ].join(' AND ');
      
      const fetchLimit = parseInt(limit, 10) + 1;
      
      // Use PREWHERE for indexed conditions (ClickHouse optimization)
      const query = indexedConditions.length > 0
        ? `
          SELECT 
            id, app_id, timestamp, level, message, 
            source, environment, metadata, trace_id, user_id
          FROM ${this.tableName}
          PREWHERE ${indexedConditions.join(' AND ')}  -- Indexed filters first
          ${nonIndexedConditions.length > 0 ? `WHERE ${nonIndexedConditions.join(' AND ')}` : ''}
          ORDER BY timestamp DESC, id DESC
          LIMIT ${fetchLimit}
        `
        : `
          SELECT 
            id, app_id, timestamp, level, message, 
            source, environment, metadata, trace_id, user_id
          FROM ${this.tableName}
          WHERE ${whereClause}
          ORDER BY timestamp DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      
      console.log(`[ClickHouse] Query: ${query}`);
      
      const result = await this.client.query({
        query: query,
        format: 'JSONEachRow'
      });
      
      // Parse results
      const logs = [];
      for await (const row of result.stream()) {
        logs.push({
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : {}
        });
      }
      
      // Check if there are more pages
      const hasMore = logs.length > limit;
      if (hasMore) logs.pop();
      
      // Generate next cursor
      const nextCursor = logs.length > 0 
        ? {
            timestamp: logs[logs.length - 1].timestamp,
            id: logs[logs.length - 1].id
          }
        : null;
      
      return { logs, nextCursor, hasMore };
      
    } catch (error) {
      throw new Error(`Failed to find logs: ${error.message}`);
    }
  }

  /**
   * Build optimized WHERE conditions
   * Separates indexed and non-indexed conditions for PREWHERE optimization
   * @param {Object} filter - Filter object
   * @returns {Object} { indexedConditions: string[], nonIndexedConditions: string[] }
   * @private
   */
  buildOptimizedWhereConditions(filter) {
    const indexedConditions = [];
    const nonIndexedConditions = [];
    
    for (const [field, filterValue] of Object.entries(filter)) {
      // Validate field is allowed
      if (!this.ALLOWED_FILTERS[field]) {
        throw new Error(`Filter field '${field}' is not allowed`);
      }
      
      const fieldConfig = this.ALLOWED_FILTERS[field];
      
      // Build condition
      let condition;
      if (typeof filterValue !== 'object' || filterValue === null) {
        // Simple equality
        condition = this.buildCondition(field, '=', filterValue, fieldConfig.type);
      } else {
        // Complex filter with operator
        const { operator, value } = filterValue;
        
        if (!operator || value === undefined) {
          throw new Error(`Filter for '${field}' must include operator and value`);
        }
        
        // Validate operator
        const upperOp = operator.toUpperCase();
        if (!fieldConfig.operators.includes(upperOp)) {
          throw new Error(
            `Operator '${operator}' not allowed for field '${field}'. ` +
            `Allowed: ${fieldConfig.operators.join(', ')}`
          );
        }
        
        condition = this.buildCondition(field, upperOp, value, fieldConfig.type);
      }
      
      // Separate indexed vs non-indexed
      if (fieldConfig.indexed) {
        indexedConditions.push(condition);
      } else {
        nonIndexedConditions.push(condition);
      }
    }
    
    return { indexedConditions, nonIndexedConditions };
  }

  /**
   * Build a single WHERE condition
   * (Same as previous implementation)
   */
  buildCondition(field, operator, value, type) {
    const escapedField = this.escapeIdentifier(field);
    
    switch (operator) {
      case '=':
      case '!=':
      case '>':
      case '<':
      case '>=':
      case '<=':
        return `${escapedField} ${operator} ${this.escapeValue(value, type)}`;
      
      case 'IN':
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error(`IN operator requires non-empty array for field '${field}'`);
        }
        const escapedValues = value.map(v => this.escapeValue(v, type)).join(', ');
        return `${escapedField} IN (${escapedValues})`;
      
      case 'LIKE':
      case 'ILIKE':
        if (typeof value !== 'string') {
          throw new Error(`${operator} requires string value for field '${field}'`);
        }
        return `${escapedField} ${operator} ${this.escapeValue(value, 'string')}`;
      
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
   * Escape field identifier (prevent SQL injection)
   * @param {string} identifier - Field name
   * @returns {string} Escaped identifier
   * @private
   */
  escapeIdentifier(identifier) {
    // ClickHouse uses backticks for identifiers
    // Remove any existing backticks and wrap in backticks
    return `\`${identifier.replace(/`/g, '')}\``;
  }

  /**
   * Escape and format value based on type
   * @param {*} value - Value to escape
   * @param {string} type - Value type (string, datetime, number)
   * @returns {string} Escaped and formatted value
   * @private
   */
  escapeValue(value, type) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    switch (type) {
      case 'string':
        // Escape single quotes by doubling them
        const escapedStr = String(value).replace(/'/g, "''");
        return `'${escapedStr}'`;
      
      case 'datetime':
        // Convert to ClickHouse DateTime64 format
        let dateStr;
        if (value instanceof Date) {
          dateStr = value.toISOString();
        } else if (typeof value === 'string') {
          // Validate ISO format
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            throw new Error(`Invalid datetime format: ${value}`);
          }
          dateStr = value;
        } else {
          throw new Error(`Invalid datetime value: ${value}`);
        }
        // Convert to ClickHouse format: YYYY-MM-DD HH:MM:SS.sss
        const formatted = dateStr.replace('T', ' ').replace('Z', '');
        return `'${formatted}'`;
      
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number value: ${value}`);
        }
        return String(num);
      
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }

  /**
   * Validate limit parameter
   * @param {number} limit - Limit value
   * @private
   */
  validateLimit(limit) {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      throw new Error('Limit must be between 1 and 1000');
    }
  }

  /**
   * Validate offset parameter
   * @param {number} offset - Offset value
   * @private
   */
  validateOffset(offset) {
    const num = parseInt(offset, 10);
    if (isNaN(num) || num < 0) {
      throw new Error('Offset must be non-negative');
    }
  }

  /**
   * Validate orderBy field
   * @param {string} orderBy - Field to order by
   * @private
   */
  validateOrderBy(orderBy) {
    const allowedFields = ['timestamp', 'level', 'app_id', 'source', 'environment'];
    if (!allowedFields.includes(orderBy)) {
      throw new Error(`Invalid orderBy field. Allowed: ${allowedFields.join(', ')}`);
    }
  }

  /**
   * Validate order direction
   * @param {string} orderDir - Order direction
   * @private
   */
  validateOrderDir(orderDir) {
    const dir = orderDir.toUpperCase();
    if (dir !== 'ASC' && dir !== 'DESC') {
      throw new Error("Order direction must be 'ASC' or 'DESC'");
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
}

module.exports = ClickHouseRepository;

