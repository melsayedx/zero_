/**
 * Dashboard Routes
 * API endpoints for dashboard management
 */

const express = require('express');
const router = express.Router();
const mongodbService = require('../../services/storage/mongodb.service');
const { validateDashboard, validatePagination } = require('../middleware/validation.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler, NotFoundError } = require('../middleware/error.middleware');
const logger = require('../../utils/logger');

/**
 * GET /api/v1/dashboards
 * List all dashboards
 */
router.get('/',
  authenticate,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { limit = 50, skip = 0 } = req.query;
    
    const dashboards = await mongodbService.listDashboards({
      owner: req.user.id,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
    
    res.json({
      dashboards,
      count: dashboards.length,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  })
);

/**
 * GET /api/v1/dashboards/public
 * List public dashboards
 */
router.get('/public',
  asyncHandler(async (req, res) => {
    const { limit = 50, skip = 0 } = req.query;
    
    const dashboards = await mongodbService.listDashboards({
      isPublic: true,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
    
    res.json({
      dashboards,
      count: dashboards.length
    });
  })
);

/**
 * GET /api/v1/dashboards/:id
 * Get specific dashboard
 */
router.get('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check access permissions
    if (!dashboard.isPublic && 
        dashboard.owner.toString() !== req.user.id.toString() &&
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    // Increment view count
    await dashboard.incrementViewCount();
    
    res.json(dashboard);
  })
);

/**
 * POST /api/v1/dashboards
 * Create new dashboard
 */
router.post('/',
  authenticate,
  validateDashboard,
  asyncHandler(async (req, res) => {
    const dashboardData = {
      ...req.body,
      owner: req.user.id
    };
    
    const dashboard = await mongodbService.createDashboard(dashboardData);
    
    logger.info('Dashboard created', {
      dashboardId: dashboard._id,
      userId: req.user.id
    });
    
    res.status(201).json(dashboard);
  })
);

/**
 * PUT /api/v1/dashboards/:id
 * Update dashboard
 */
router.put('/:id',
  authenticate,
  validateDashboard,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    const updated = await mongodbService.updateDashboard(
      req.params.id,
      req.body
    );
    
    logger.info('Dashboard updated', {
      dashboardId: req.params.id,
      userId: req.user.id
    });
    
    res.json(updated);
  })
);

/**
 * PATCH /api/v1/dashboards/:id
 * Partial update dashboard
 */
router.patch('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    const updated = await mongodbService.updateDashboard(
      req.params.id,
      req.body
    );
    
    res.json(updated);
  })
);

/**
 * DELETE /api/v1/dashboards/:id
 * Delete dashboard
 */
router.delete('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    await mongodbService.deleteDashboard(req.params.id);
    
    logger.info('Dashboard deleted', {
      dashboardId: req.params.id,
      userId: req.user.id
    });
    
    res.json({
      status: 'deleted',
      id: req.params.id
    });
  })
);

/**
 * POST /api/v1/dashboards/:id/widgets
 * Add widget to dashboard
 */
router.post('/:id/widgets',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    await dashboard.addWidget(req.body);
    
    res.json(dashboard);
  })
);

/**
 * DELETE /api/v1/dashboards/:id/widgets/:widgetId
 * Remove widget from dashboard
 */
router.delete('/:id/widgets/:widgetId',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    await dashboard.removeWidget(req.params.widgetId);
    
    res.json(dashboard);
  })
);

/**
 * PUT /api/v1/dashboards/:id/widgets/:widgetId
 * Update widget in dashboard
 */
router.put('/:id/widgets/:widgetId',
  authenticate,
  asyncHandler(async (req, res) => {
    const dashboard = await mongodbService.getDashboard(req.params.id);
    
    // Check ownership
    if (dashboard.owner.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      throw new NotFoundError('Dashboard not found');
    }
    
    await dashboard.updateWidget(req.params.widgetId, req.body);
    
    res.json(dashboard);
  })
);

module.exports = router;

