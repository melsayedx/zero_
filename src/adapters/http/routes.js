const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');

/**
 * Setup HTTP routes
 * @param {Object} controllers - Object containing controller instances
 * @returns {express.Router} Configured Express router
 */
function setupRoutes(controllers) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware();

  // ============================================
  // PUBLIC ROUTES (No Authentication Required)
  // ============================================

  // Health check endpoint
  router.get('/health', async (req, res) => await controllers.healthCheckController.handle(req, res));

  // Stats endpoint (includes batch buffer metrics)
  router.get('/api/stats', async (req, res) => await controllers.statsController.handle(req, res));

  // ============================================
  // AUTHENTICATION ROUTES
  // ============================================

  // Register new user
  router.post('/api/auth/register', async (req, res) => await controllers.registerController.handle(req, res));

  // Login user (get JWT token)
  router.post('/api/auth/login', async (req, res) => await controllers.loginController.handle(req, res));

  // Get current user info (protected)
  router.get('/api/auth/me', authMiddleware.authenticate(), async (req, res) => await controllers.meController.handle(req, res));

  // ============================================
  // APP MANAGEMENT ROUTES (Protected)
  // ============================================

  // Create new app
  router.post('/api/apps', authMiddleware.authenticate(), async (req, res) => await controllers.createAppController.handle(req, res));

  // List user's apps
  router.get('/api/apps', authMiddleware.authenticate(), async (req, res) => await controllers.listAppsController.handle(req, res));

  // Get specific app
  router.get('/api/apps/:app_id', authMiddleware.authenticate(), async (req, res) => await controllers.getAppController.handle(req, res));

  // ============================================
  // LOG INGESTION & RETRIEVAL ROUTES (Protected)
  // ============================================

  // Ingest logs (requires authentication and app ownership verification)
  router.post('/api/logs', 
    authMiddleware.authenticate(),
    async (req, res, next) => {
      try {
        // Verify app ownership before ingesting
        const { app_id } = req.body;
        
        if (!app_id) {
          return res.status(400).json({
            success: false,
            message: 'app_id is required in request body'
          });
        }

        const verifyResult = await controllers.verifyAppAccessUseCase.execute({
          app_id,
          user_id: req.user.user_id
        });

        if (!verifyResult.success || !verifyResult.hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this app'
          });
        }

        // Continue to ingest controller
        next();
      } catch (error) {
        console.error('[Routes] Error verifying app access:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify app access'
        });
      }
    },
    async (req, res) => await controllers.ingestLogController.handle(req, res)
  );
  
  // Retrieve logs by app_id (requires authentication and app ownership verification)
  router.get('/api/logs/:app_id',
    authMiddleware.authenticate(),
    async (req, res, next) => {
      try {
        // Verify app ownership before retrieving
        const { app_id } = req.params;

        const verifyResult = await controllers.verifyAppAccessUseCase.execute({
          app_id,
          user_id: req.user.user_id
        });

        if (!verifyResult.success || !verifyResult.hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this app'
          });
        }

        // Continue to get logs controller
        next();
      } catch (error) {
        console.error('[Routes] Error verifying app access:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify app access'
        });
      }
    },
    async (req, res) => await controllers.getLogsByAppIdController.handle(req, res)
  );

  return router;
}

module.exports = setupRoutes;

