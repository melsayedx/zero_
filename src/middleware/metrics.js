/**
 * Metrics Middleware
 * Tracks request statistics for monitoring
 */

// Metrics storage (in-memory, shared across middleware calls)
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  requestsPerSecond: 0,
  startTime: Date.now(),
  lastResetTime: Date.now(),
  
  // Per-endpoint metrics
  endpoints: {},
  
  // Recent requests (for rate calculation)
  recentRequests: []
};

/**
 * Middleware to track requests
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Track request start
  metrics.totalRequests++;
  metrics.recentRequests.push(Date.now());
  
  // Clean old requests (keep last 60 seconds)
  const cutoff = Date.now() - 60000;
  metrics.recentRequests = metrics.recentRequests.filter(t => t > cutoff);
  
  // Calculate requests per second
  if (metrics.recentRequests.length > 0) {
    const timeSpan = (Date.now() - metrics.recentRequests[0]) / 1000;
    metrics.requestsPerSecond = timeSpan > 0 ? metrics.recentRequests.length / timeSpan : 0;
  }
  
  // Track per-endpoint
  const endpoint = `${req.method} ${req.path}`;
  if (!metrics.endpoints[endpoint]) {
    metrics.endpoints[endpoint] = {
      count: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };
  }
  metrics.endpoints[endpoint].count++;
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Track success/failure
    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }
    
    // Update endpoint metrics
    const endpointMetrics = metrics.endpoints[endpoint];
    endpointMetrics.totalResponseTime += responseTime;
    endpointMetrics.avgResponseTime = endpointMetrics.totalResponseTime / endpointMetrics.count;
    
    return originalSend.call(this, data);
  };
  
  next();
}

/**
 * Get current metrics
 */
function getMetrics() {
  const uptime = (Date.now() - metrics.startTime) / 1000;
  
  return {
    uptime: Math.floor(uptime),
    totalRequests: metrics.totalRequests,
    successfulRequests: metrics.successfulRequests,
    failedRequests: metrics.failedRequests,
    requestsPerSecond: Math.round(metrics.requestsPerSecond * 100) / 100,
    successRate: metrics.totalRequests > 0 
      ? Math.round((metrics.successfulRequests / metrics.totalRequests) * 10000) / 100 
      : 100,
    endpoints: Object.entries(metrics.endpoints).map(([path, data]) => ({
      path,
      count: data.count,
      avgResponseTime: Math.round(data.avgResponseTime)
    })).sort((a, b) => b.count - a.count).slice(0, 10) // Top 10 endpoints
  };
}

/**
 * Reset metrics
 */
function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.failedRequests = 0;
  metrics.requestsPerSecond = 0;
  metrics.startTime = Date.now();
  metrics.lastResetTime = Date.now();
  metrics.endpoints = {};
  metrics.recentRequests = [];
}

module.exports = {
  metricsMiddleware,
  getMetrics,
  resetMetrics
};

