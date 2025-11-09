/**
 * Query Routes
 * API endpoints for querying logs from ClickHouse
 */

const express = require('express');
const router = express.Router();
const clickhouseService = require('../../services/storage/clickhouse.service');
const cacheService = require('../../services/cache/redis-cache.service');
const { validateQuery } = require('../middleware/validation.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const performanceMonitor = require('../../utils/performance-monitor');
const logger = require('../../utils/logger');

/**
 * POST /api/v1/query/logs
 * Query logs with filters
 */
router.post('/logs',
  authenticate,
  validateQuery,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const queryParams = req.body;
    
    // Check cache first
    const useCache = req.query.cache !== 'false';
    let logs;
    let fromCache = false;
    
    if (useCache) {
      const cached = await cacheService.getQueryResult('logs', queryParams);
      if (cached) {
        logs = cached;
        fromCache = true;
        performanceMonitor.trackQuery(Date.now() - startTime, true);
      }
    }
    
    // Query from database if not cached
    if (!logs) {
      logs = await clickhouseService.queryLogs(queryParams);
      
      // Cache the result
      if (useCache && logs) {
        await cacheService.setQueryResult('logs', queryParams, logs);
      }
      
      performanceMonitor.trackQuery(Date.now() - startTime, false);
    }
    
    const duration = Date.now() - startTime;
    performanceMonitor.trackRequest(duration, res.statusCode);
    
    res.json({
      ...logs,
      cached: fromCache,
      queryTime: duration
    });
  })
);

/**
 * GET /api/v1/query/logs/:id
 * Get specific log entry (not implemented - ClickHouse doesn't have primary keys)
 */
router.get('/logs/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    res.status(501).json({
      error: 'Not implemented',
      message: 'Log retrieval by ID is not supported in ClickHouse'
    });
  })
);

/**
 * POST /api/v1/query/count
 * Count logs matching filters
 */
router.post('/count',
  authenticate,
  validateQuery,
  asyncHandler(async (req, res) => {
    const queryParams = req.body;
    
    const count = await clickhouseService.countLogs(queryParams);
    
    res.json({
      count,
      filters: queryParams
    });
  })
);

/**
 * POST /api/v1/query/by-level
 * Get log distribution by level
 */
router.post('/by-level',
  authenticate,
  asyncHandler(async (req, res) => {
    const { timeRange, service } = req.body;
    
    if (!timeRange || !timeRange.start || !timeRange.end) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'timeRange with start and end is required'
      });
    }
    
    // Check cache
    const cacheKey = { timeRange, service };
    const cached = await cacheService.getQueryResult('by-level', cacheKey);
    
    if (cached) {
      return res.json({ data: cached, cached: true });
    }
    
    const data = await clickhouseService.getLogsByLevel({ timeRange, service });
    
    // Cache result
    await cacheService.setQueryResult('by-level', cacheKey, data, 60);
    
    res.json({ data, cached: false });
  })
);

/**
 * POST /api/v1/query/by-service
 * Get log distribution by service
 */
router.post('/by-service',
  authenticate,
  asyncHandler(async (req, res) => {
    const { timeRange } = req.body;
    
    if (!timeRange || !timeRange.start || !timeRange.end) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'timeRange with start and end is required'
      });
    }
    
    const cached = await cacheService.getQueryResult('by-service', { timeRange });
    
    if (cached) {
      return res.json({ data: cached, cached: true });
    }
    
    const data = await clickhouseService.getLogsByService({ timeRange });
    
    await cacheService.setQueryResult('by-service', { timeRange }, data, 60);
    
    res.json({ data, cached: false });
  })
);

/**
 * POST /api/v1/query/timeseries
 * Get time series data
 */
router.post('/timeseries',
  authenticate,
  asyncHandler(async (req, res) => {
    const { timeRange, interval = '1 minute', service, level } = req.body;
    
    if (!timeRange || !timeRange.start || !timeRange.end) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'timeRange with start and end is required'
      });
    }
    
    const params = { timeRange, interval, service, level };
    const cached = await cacheService.getQueryResult('timeseries', params);
    
    if (cached) {
      return res.json({ data: cached, cached: true });
    }
    
    const data = await clickhouseService.getTimeSeries(params);
    
    await cacheService.setQueryResult('timeseries', params, data, 30);
    
    res.json({ data, cached: false });
  })
);

/**
 * GET /api/v1/query/trace/:traceId
 * Get all logs for a specific trace ID
 */
router.get('/trace/:traceId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { traceId } = req.params;
    
    const logs = await clickhouseService.getLogsByTraceId(traceId);
    
    res.json({
      traceId,
      logs,
      count: logs.length
    });
  })
);

/**
 * POST /api/v1/query/errors/top
 * Get top error messages
 */
router.post('/errors/top',
  authenticate,
  asyncHandler(async (req, res) => {
    const { timeRange, limit = 10 } = req.body;
    
    if (!timeRange || !timeRange.start || !timeRange.end) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'timeRange with start and end is required'
      });
    }
    
    const errors = await clickhouseService.getTopErrors({ timeRange, limit });
    
    res.json({
      errors,
      count: errors.length
    });
  })
);

/**
 * POST /api/v1/query/search
 * Full-text search on log messages
 */
router.post('/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { timeRange, search, limit = 100 } = req.body;
    
    if (!timeRange || !timeRange.start || !timeRange.end) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'timeRange with start and end is required'
      });
    }
    
    if (!search) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'search term is required'
      });
    }
    
    const logs = await clickhouseService.queryLogs({
      timeRange,
      search,
      limit
    });
    
    res.json(logs);
  })
);

/**
 * DELETE /api/v1/query/cache
 * Clear query cache
 */
router.delete('/cache',
  authenticate,
  asyncHandler(async (req, res) => {
    const count = await cacheService.invalidatePattern('*');
    
    res.json({
      status: 'cleared',
      keysDeleted: count
    });
  })
);

module.exports = router;

