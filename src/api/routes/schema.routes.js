/**
 * Schema Routes
 * API endpoints for schema registry management
 */

const express = require('express');
const router = express.Router();
const schemaRegistryService = require('../../services/transformation/schema-registry.service');
const { validateSchema } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const logger = require('../../utils/logger');

/**
 * GET /api/v1/schemas
 * List all schemas
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const schemas = await schemaRegistryService.listSchemas();
    
    res.json({
      schemas,
      count: schemas.length
    });
  })
);

/**
 * GET /api/v1/schemas/:name
 * Get specific schema by name
 */
router.get('/:name',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = await schemaRegistryService.getSchema(req.params.name);
    
    res.json(schema);
  })
);

/**
 * GET /api/v1/schemas/service/:serviceName
 * Get schema for a specific service
 */
router.get('/service/:serviceName',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = await schemaRegistryService.getSchemaForService(
      req.params.serviceName
    );
    
    if (!schema) {
      return res.status(404).json({
        error: 'Not found',
        message: `No schema found for service: ${req.params.serviceName}`
      });
    }
    
    res.json(schema);
  })
);

/**
 * POST /api/v1/schemas/register
 * Register new schema
 */
router.post('/register',
  authenticate,
  validateSchema,
  asyncHandler(async (req, res) => {
    const schemaData = {
      ...req.body,
      owner: req.user.id
    };
    
    const schema = await schemaRegistryService.registerSchema(schemaData);
    
    logger.info('Schema registered', {
      schemaName: schema.name,
      userId: req.user.id
    });
    
    res.status(201).json(schema);
  })
);

/**
 * POST /api/v1/schemas/auto-register
 * Auto-register schema from log samples
 */
router.post('/auto-register',
  authenticate,
  asyncHandler(async (req, res) => {
    const { logs, serviceName } = req.body;
    
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'logs array is required and must not be empty'
      });
    }
    
    if (!serviceName) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'serviceName is required'
      });
    }
    
    const schema = await schemaRegistryService.autoRegisterSchema(
      logs,
      serviceName,
      req.user.id
    );
    
    logger.info('Schema auto-registered', {
      schemaName: schema.name,
      serviceName,
      userId: req.user.id
    });
    
    res.status(201).json(schema);
  })
);

/**
 * POST /api/v1/schemas/:name/validate
 * Validate log against schema
 */
router.post('/:name/validate',
  authenticate,
  asyncHandler(async (req, res) => {
    const { log } = req.body;
    
    if (!log) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'log object is required'
      });
    }
    
    const result = await schemaRegistryService.validateLog(log, req.params.name);
    
    res.json(result);
  })
);

/**
 * POST /api/v1/schemas/compare
 * Compare detected schema with registered schema
 */
router.post('/compare',
  authenticate,
  asyncHandler(async (req, res) => {
    const { logs, serviceName } = req.body;
    
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'logs array is required and must not be empty'
      });
    }
    
    if (!serviceName) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'serviceName is required'
      });
    }
    
    const comparison = await schemaRegistryService.compareWithRegistered(
      logs,
      serviceName
    );
    
    res.json(comparison);
  })
);

/**
 * GET /api/v1/schemas/:name/json-schema
 * Get schema in JSON Schema format
 */
router.get('/:name/json-schema',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = await schemaRegistryService.getSchema(req.params.name);
    const jsonSchema = schema.toJSONSchema();
    
    res.json(jsonSchema);
  })
);

/**
 * PUT /api/v1/schemas/:name/stats
 * Update schema statistics
 */
router.put('/:name/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const { logsCount, errorsCount = 0 } = req.body;
    
    if (typeof logsCount !== 'number') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'logsCount must be a number'
      });
    }
    
    await schemaRegistryService.updateStats(
      req.params.name,
      logsCount,
      errorsCount
    );
    
    res.json({
      status: 'updated',
      schema: req.params.name
    });
  })
);

/**
 * DELETE /api/v1/schemas/cache
 * Clear schema cache
 */
router.delete('/cache',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    schemaRegistryService.clearCache();
    
    res.json({
      status: 'cleared',
      message: 'Schema cache cleared'
    });
  })
);

/**
 * DELETE /api/v1/schemas/cache/:name
 * Invalidate specific schema in cache
 */
router.delete('/cache/:name',
  authenticate,
  asyncHandler(async (req, res) => {
    schemaRegistryService.invalidateCache(req.params.name);
    
    res.json({
      status: 'invalidated',
      schema: req.params.name
    });
  })
);

module.exports = router;

