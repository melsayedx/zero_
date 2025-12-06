/**
 * QueryResult
 * Structured result object for query operations
 */
class QueryResult {
  constructor({
    appId,
    count,
    logs,
    hasMore = false,
    nextCursor = null,
    queryTime,
    filter = {},
    limit = 100
  }) {
    this.appId = appId;              // Application ID queried
    this.count = count;              // Number of logs returned
    this.logs = logs;                // Array of log entries
    this.hasMore = hasMore;          // Whether more results are available
    this.nextCursor = nextCursor;    // Cursor for next page
    this.queryTime = queryTime;      // Query execution time in ms

    // Query metadata
    this.filter = filter;            // Applied filters
    this.limit = limit;              // Requested limit
    this.actualLimit = logs.length;  // Actual number of logs returned

    // Performance metrics
    this.timestamp = new Date().toISOString();
    this.successRate = count > 0 ? 100 : 0; // Query success rate
  }

  /**
   * Check if query returned results
   */
  hasResults() {
    return this.count > 0;
  }

  /**
   * Check if there are more results available
   */
  canPaginate() {
    return this.hasMore && this.nextCursor !== null;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      queryTime: this.queryTime,
      logsPerSecond: this.queryTime > 0 ? (this.count / this.queryTime) * 1000 : 0,
      actualLimit: this.actualLimit,
      hasMore: this.hasMore
    };
  }

  /**
   * Summary for monitoring/logging
   */
  toSummary() {
    return {
      appId: this.appId,
      count: this.count,
      hasMore: this.hasMore,
      queryTime: this.queryTime,
      logsPerSecond: Math.round(this.getPerformanceMetrics().logsPerSecond * 100) / 100,
      timestamp: this.timestamp,
      filter: this.filter,
      limit: this.limit
    };
  }

  /**
   * Detailed report with logs
   */
  toDetailedReport() {
    return {
      ...this.toSummary(),
      logs: this.logs,
      nextCursor: this.nextCursor,
      actualLimit: this.actualLimit
    };
  }
}

module.exports = QueryResult;

