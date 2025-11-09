/**
 * Performance Monitoring Utility
 * Tracks system performance, metrics, and resource usage
 */

const logger = require('./logger');

/**
 * Performance metrics storage
 */
const metrics = {
  requests: {
    total: 0,
    successful: 0,
    failed: 0,
    avgDuration: 0
  },
  ingestion: {
    logsProcessed: 0,
    batchesProcessed: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
    lastIngestionRate: 0
  },
  queries: {
    total: 0,
    cached: 0,
    avgDuration: 0
  },
  system: {
    uptime: 0,
    memoryUsage: {},
    cpuUsage: 0
  }
};

/**
 * Request duration tracking
 */
const requestTimings = [];
const MAX_TIMINGS = 1000;

/**
 * Ingestion tracking
 */
const ingestionTimings = [];
const MAX_INGESTION_TIMINGS = 100;

/**
 * Start time for metrics
 */
const startTime = Date.now();

/**
 * Track HTTP request
 * @param {number} duration - Request duration in milliseconds
 * @param {number} statusCode - HTTP status code
 */
const trackRequest = (duration, statusCode) => {
  metrics.requests.total++;
  
  if (statusCode >= 200 && statusCode < 400) {
    metrics.requests.successful++;
  } else {
    metrics.requests.failed++;
  }
  
  // Update timings array
  requestTimings.push(duration);
  if (requestTimings.length > MAX_TIMINGS) {
    requestTimings.shift();
  }
  
  // Calculate average
  metrics.requests.avgDuration = 
    requestTimings.reduce((sum, t) => sum + t, 0) / requestTimings.length;
};

/**
 * Track log ingestion
 * @param {number} logCount - Number of logs processed
 * @param {number} duration - Processing duration in milliseconds
 */
const trackIngestion = (logCount, duration) => {
  metrics.ingestion.logsProcessed += logCount;
  metrics.ingestion.batchesProcessed++;
  
  // Update batch size average
  metrics.ingestion.avgBatchSize = 
    metrics.ingestion.logsProcessed / metrics.ingestion.batchesProcessed;
  
  // Update processing time average
  ingestionTimings.push(duration);
  if (ingestionTimings.length > MAX_INGESTION_TIMINGS) {
    ingestionTimings.shift();
  }
  
  metrics.ingestion.avgProcessingTime = 
    ingestionTimings.reduce((sum, t) => sum + t, 0) / ingestionTimings.length;
  
  // Calculate ingestion rate (logs per second)
  metrics.ingestion.lastIngestionRate = Math.round((logCount / duration) * 1000);
};

/**
 * Track query execution
 * @param {number} duration - Query duration in milliseconds
 * @param {boolean} cached - Whether result was from cache
 */
const trackQuery = (duration, cached = false) => {
  metrics.queries.total++;
  
  if (cached) {
    metrics.queries.cached++;
  }
  
  // Calculate average query duration
  const totalQueries = metrics.queries.total;
  const currentAvg = metrics.queries.avgDuration;
  metrics.queries.avgDuration = 
    ((currentAvg * (totalQueries - 1)) + duration) / totalQueries;
};

/**
 * Get current system metrics
 * @returns {Object} System metrics
 */
const getSystemMetrics = () => {
  const memUsage = process.memoryUsage();
  
  metrics.system.uptime = Math.floor((Date.now() - startTime) / 1000);
  metrics.system.memoryUsage = {
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024) // MB
  };
  
  // CPU usage (approximate)
  const cpuUsage = process.cpuUsage();
  metrics.system.cpuUsage = Math.round(
    (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to seconds
  );
  
  return { ...metrics.system };
};

/**
 * Get all metrics
 * @returns {Object} All performance metrics
 */
const getAllMetrics = () => {
  getSystemMetrics(); // Update system metrics
  
  return {
    ...metrics,
    timestamp: new Date().toISOString(),
    uptimeSeconds: metrics.system.uptime
  };
};

/**
 * Get metrics summary for health check
 * @returns {Object} Metrics summary
 */
const getMetricsSummary = () => {
  getSystemMetrics();
  
  return {
    uptime: metrics.system.uptime,
    requests: {
      total: metrics.requests.total,
      successRate: metrics.requests.total > 0 
        ? ((metrics.requests.successful / metrics.requests.total) * 100).toFixed(2) + '%'
        : '0%',
      avgDuration: Math.round(metrics.requests.avgDuration)
    },
    ingestion: {
      totalLogs: metrics.ingestion.logsProcessed,
      totalBatches: metrics.ingestion.batchesProcessed,
      avgBatchSize: Math.round(metrics.ingestion.avgBatchSize),
      lastRate: metrics.ingestion.lastIngestionRate + ' logs/sec'
    },
    queries: {
      total: metrics.queries.total,
      cacheHitRate: metrics.queries.total > 0
        ? ((metrics.queries.cached / metrics.queries.total) * 100).toFixed(2) + '%'
        : '0%',
      avgDuration: Math.round(metrics.queries.avgDuration)
    },
    memory: metrics.system.memoryUsage
  };
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
  metrics.requests = {
    total: 0,
    successful: 0,
    failed: 0,
    avgDuration: 0
  };
  metrics.ingestion = {
    logsProcessed: 0,
    batchesProcessed: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
    lastIngestionRate: 0
  };
  metrics.queries = {
    total: 0,
    cached: 0,
    avgDuration: 0
  };
  
  requestTimings.length = 0;
  ingestionTimings.length = 0;
  
  logger.info('Performance metrics reset');
};

/**
 * Log current metrics
 */
const logMetrics = () => {
  const summary = getMetricsSummary();
  logger.info({ metrics: summary }, 'Current performance metrics');
};

/**
 * Start periodic metrics logging
 * @param {number} intervalSeconds - Interval in seconds
 * @returns {NodeJS.Timeout} Interval ID
 */
const startPeriodicLogging = (intervalSeconds = 60) => {
  return setInterval(() => {
    logMetrics();
  }, intervalSeconds * 1000);
};

/**
 * Create a performance timer
 * @param {string} label - Timer label
 * @returns {Function} Stop function that returns duration
 */
const createTimer = (label) => {
  const start = Date.now();
  
  return () => {
    const duration = Date.now() - start;
    logger.perf(label, duration);
    return duration;
  };
};

/**
 * Measure async function execution time
 * @param {Function} fn - Async function to measure
 * @param {string} label - Measurement label
 * @returns {Function} Wrapped function
 */
const measureAsync = (fn, label) => {
  return async (...args) => {
    const timer = createTimer(label);
    try {
      const result = await fn(...args);
      timer();
      return result;
    } catch (error) {
      timer();
      throw error;
    }
  };
};

/**
 * Check if system is healthy based on metrics
 * @returns {Object} Health status
 */
const checkHealth = () => {
  const sysMetrics = getSystemMetrics();
  
  const issues = [];
  
  // Check memory usage (warn if > 80% of heap)
  const heapUsedPercent = (sysMetrics.memoryUsage.heapUsed / sysMetrics.memoryUsage.heapTotal) * 100;
  if (heapUsedPercent > 80) {
    issues.push(`High memory usage: ${heapUsedPercent.toFixed(2)}%`);
  }
  
  // Check request failure rate
  if (metrics.requests.total > 100) {
    const failureRate = (metrics.requests.failed / metrics.requests.total) * 100;
    if (failureRate > 10) {
      issues.push(`High failure rate: ${failureRate.toFixed(2)}%`);
    }
  }
  
  return {
    healthy: issues.length === 0,
    issues,
    metrics: getMetricsSummary()
  };
};

module.exports = {
  trackRequest,
  trackIngestion,
  trackQuery,
  getSystemMetrics,
  getAllMetrics,
  getMetricsSummary,
  resetMetrics,
  logMetrics,
  startPeriodicLogging,
  createTimer,
  measureAsync,
  checkHealth
};

