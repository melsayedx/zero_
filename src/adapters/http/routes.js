const express = require('express');

/**
 * Setup HTTP routes
 * @param {Object} controllers - Object containing controller instances
 * @returns {express.Router} Configured Express router
 */
function setupRoutes(controllers) {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => controllers.healthCheckController.handle(req, res));

  // Log ingestion endpoint
  router.post('/api/logs', (req, res) => controllers.ingestLogController.handle(req, res));

  return router;
}

module.exports = setupRoutes;

