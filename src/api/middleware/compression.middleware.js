/**
 * Compression Middleware
 * Response compression for API endpoints
 */

const compression = require('compression');
const logger = require('../../utils/logger');

/**
 * Compression middleware with custom configuration
 * Uses gzip compression for responses > 1kb
 */
const compressionMiddleware = compression({
  // Compression level: 6 is a good balance between speed and ratio
  level: 6,
  
  // Only compress responses larger than 1kb
  threshold: 1024,
  
  // Custom filter function
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }

    // Don't compress streaming responses
    if (res.getHeader('Content-Type') === 'text/event-stream') {
      return false;
    }

    // Use compression's default filter function
    return compression.filter(req, res);
  }
});

/**
 * Log compression statistics
 */
const logCompression = (req, res, next) => {
  // Store original write and end methods
  const originalWrite = res.write;
  const originalEnd = res.end;
  
  let uncompressedSize = 0;
  const chunks = [];

  // Override write method
  res.write = function(chunk, ...args) {
    if (chunk) {
      uncompressedSize += chunk.length;
      chunks.push(chunk);
    }
    return originalWrite.apply(res, [chunk, ...args]);
  };

  // Override end method
  res.end = function(chunk, ...args) {
    if (chunk) {
      uncompressedSize += chunk.length;
      chunks.push(chunk);
    }

    // Log compression stats if response was compressed
    const contentEncoding = res.getHeader('Content-Encoding');
    if (contentEncoding === 'gzip' || contentEncoding === 'deflate') {
      const compressedSize = res.getHeader('Content-Length') || 0;
      const ratio = uncompressedSize > 0 
        ? ((1 - compressedSize / uncompressedSize) * 100).toFixed(2)
        : 0;

      logger.debug('Response compressed', {
        path: req.path,
        uncompressedSize,
        compressedSize,
        ratio: `${ratio}%`,
        encoding: contentEncoding
      });
    }

    return originalEnd.apply(res, [chunk, ...args]);
  };

  next();
};

/**
 * Selective compression based on content type
 */
const selectiveCompression = (req, res, next) => {
  const contentType = res.getHeader('Content-Type');
  
  // List of compressible content types
  const compressibleTypes = [
    'text/html',
    'text/plain',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/xml'
  ];

  // Check if content type is compressible
  if (contentType && compressibleTypes.some(type => contentType.includes(type))) {
    return compressionMiddleware(req, res, next);
  }

  next();
};

/**
 * Brotli compression support (Node.js 11.7.0+)
 * Note: Brotli provides better compression than gzip but is slower
 */
const brotliSupport = (req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  if (acceptEncoding.includes('br')) {
    // Client supports Brotli
    res.setHeader('Content-Encoding', 'br');
  }
  
  next();
};

module.exports = {
  compressionMiddleware,
  logCompression,
  selectiveCompression,
  brotliSupport
};

