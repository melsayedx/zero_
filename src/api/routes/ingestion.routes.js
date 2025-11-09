/**
 * Ingestion Routes
 * API endpoints for log ingestion
 */

const express = require('express');
const router = express.Router();
const logIngestionService = require('../../services/ingestion/log-ingestion.service');
const batchProcessor = require('../../services/ingestion/batch-processor.service');
const { validateLogEntry, validateBatchLogs } = require('../middleware/validation.middleware');
const { authenticateApiKey } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const performanceMonitor = require('../../utils/performance-monitor');
const logger = require('../../utils/logger');

/**
 * POST /api/v1/ingest
 * Ingest single log entry or batch
 */
router.post('/', 
  authenticateApiKey,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Check if it's a batch or single log
    const isBatch = Array.isArray(req.body.logs);
    
    if (isBatch) {
      // Batch ingestion
      const result = await logIngestionService.ingestBatch(req.body.logs);
      
      const duration = Date.now() - startTime;
      performanceMonitor.trackRequest(duration, res.statusCode);
      
      return res.status(202).json({
        status: 'accepted',
        ...result
      });
    } else {
      // Single log ingestion
      const result = await logIngestionService.ingestLog(req.body);
      
      const duration = Date.now() - startTime;
      performanceMonitor.trackRequest(duration, res.statusCode);
      
      return res.status(202).json(result);
    }
  })
);

/**
 * POST /api/v1/ingest/batch
 * Explicit batch ingestion endpoint
 */
router.post('/batch',
  authenticateApiKey,
  validateBatchLogs,
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    const result = await logIngestionService.ingestBatch(req.body.logs);
    
    const duration = Date.now() - startTime;
    performanceMonitor.trackRequest(duration, res.statusCode);
    
    res.status(202).json({
      status: 'accepted',
      ...result
    });
  })
);

/**
 * POST /api/v1/ingest/with-schema
 * Ingest logs with automatic schema detection
 */
router.post('/with-schema',
  authenticateApiKey,
  asyncHandler(async (req, res) => {
    const { logs, service } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'logs array is required'
      });
    }
    
    if (!service) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'service name is required'
      });
    }
    
    const result = await logIngestionService.ingestWithSchemaDetection(logs, service);
    
    res.status(202).json({
      status: 'accepted',
      ...result
    });
  })
);

/**
 * POST /api/v1/ingest/flush
 * Force flush buffered logs
 */
router.post('/flush',
  authenticateApiKey,
  asyncHandler(async (req, res) => {
    const result = await logIngestionService.flush();
    
    res.json({
      status: 'flushed',
      ...result
    });
  })
);

/**
 * GET /api/v1/ingest/stats
 * Get ingestion statistics
 */
router.get('/stats',
  authenticateApiKey,
  asyncHandler(async (req, res) => {
    const stats = logIngestionService.getStats();
    
    res.json({
      status: 'ok',
      stats
    });
  })
);

/**
 * GET /api/v1/ingest/health
 * Health check for ingestion service
 */
router.get('/health',
  asyncHandler(async (req, res) => {
    const health = logIngestionService.healthCheck();
    
    res.json(health);
  })
);

module.exports = router;

