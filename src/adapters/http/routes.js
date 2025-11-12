const express = require('express');

/**
 * Setup HTTP routes
 * @param {Object} controllers - Object containing controller instances
 * @returns {express.Router} Configured Express router
 */
function setupRoutes(controllers) {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', async (req, res) => await controllers.healthCheckController.handle(req, res));

  // Log ingestion endpoints
  router.post('/api/logs', async (req, res) => await controllers.ingestLogController.handle(req, res));
  
  // Log retrieval endpoints
  router.get('/api/logs/:app_id', async (req, res) => await controllers.getLogsByAppIdController.handle(req, res));

  return router;
}

module.exports = setupRoutes;

