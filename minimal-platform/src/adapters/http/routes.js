/**
 * HTTP Routes
 * Maps URLs to controllers
 */

const express = require('express');

function createRoutes(logController) {
  const router = express.Router();

  // Health check
  router.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Core endpoint: Ingest logs
  router.post('/api/logs', (req, res) => logController.ingestLog(req, res));

  return router;
}

module.exports = { createRoutes };

