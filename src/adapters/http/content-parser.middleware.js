/**
 * Content Parser Middleware
 * Handles parsing of both JSON and Protocol Buffer formats
 * Maintains backward compatibility with existing JSON API
 */

const { getProtobufParser } = require('./protobuf-parser');

/**
 * Middleware to parse request body based on Content-Type
 * Supports:
 * - application/json (backward compatible)
 * - application/x-protobuf (single entry)
 * - application/x-protobuf-batch (batch of entries)
 * 
 * Uses worker threads for large protobuf payloads to prevent event loop blocking
 * 
 * @param {ValidationService} validationService - Optional validation service for worker-based parsing
 * @returns {Function} Express middleware function
 */
function createContentParserMiddleware(validationService = null) {
  let protobufParser = null;

  // Initialize protobuf parser once
  const initPromise = getProtobufParser()
    .then(parser => {
      protobufParser = parser;
      console.log('[ContentParser] Protobuf parser initialized');
    })
    .catch(error => {
      console.error('[ContentParser] Failed to initialize protobuf parser:', error);
    });

  return async function contentParserMiddleware(req, res, next) {
    // Skip parsing for non-POST requests or requests without body
    if (req.method !== 'POST' || !req.is('application/*')) {
      return next();
    }

    const contentType = req.get('content-type') || '';

    try {
      // Handle JSON format (backward compatible)
      if (contentType.includes('application/json')) {
        // Express json() middleware already handled this
        // Ensure req.body is an array for consistency
        if (req.body && !Array.isArray(req.body)) {
          req.body = [req.body];
        }
        req.contentFormat = 'json';
        return next();
      }

      // Handle Protocol Buffer formats
      if (contentType.includes('application/x-protobuf')) {
        // Ensure protobuf parser is initialized
        await initPromise;
        
        if (!protobufParser) {
          return res.status(500).json({
            success: false,
            message: 'Protocol Buffer parser not available'
          });
        }

        // Get raw buffer from request
        const buffer = await getRawBody(req);

        // Determine if this is a batch or single entry
        const isBatch = contentType.includes('batch') || 
                       contentType.includes('application/x-protobuf-batch');

        // Try worker-based decoding for large payloads
        let decodedData = null;
        if (validationService) {
          decodedData = await validationService.decodeProtobuf(buffer, isBatch);
        }

        // Fallback to main thread if worker not used or failed
        if (!decodedData) {
          if (isBatch) {
            decodedData = protobufParser.decodeBatch(buffer);
            req.contentFormat = 'protobuf-batch';
          } else {
            const singleEntry = protobufParser.decodeSingleEntry(buffer);
            decodedData = [singleEntry]; // Wrap in array for consistency
            req.contentFormat = 'protobuf-single';
          }
        } else {
          // Data decoded by worker
          req.contentFormat = isBatch ? 'protobuf-batch-worker' : 'protobuf-single-worker';
          // Ensure array format
          if (!Array.isArray(decodedData)) {
            decodedData = [decodedData];
          }
        }

        // Set parsed data as req.body for downstream processing
        req.body = decodedData;
        
        return next();
      }

      // Unsupported content type
      return res.status(415).json({
        success: false,
        message: 'Unsupported Media Type',
        supportedTypes: [
          'application/json',
          'application/x-protobuf',
          'application/x-protobuf-batch'
        ]
      });

    } catch (error) {
      console.error('[ContentParser] Error parsing request:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse request body',
        error: error.message,
        contentType: contentType
      });
    }
  };
}

/**
 * Get raw body buffer from request stream
 * @param {Request} req - Express request
 * @returns {Promise<Buffer>} Raw body buffer
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    req.on('data', chunk => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Create raw body parser middleware for protobuf
 * This should be used BEFORE json() middleware
 * 
 * @returns {Function} Express middleware
 */
function createRawBodyMiddleware() {
  return function rawBodyMiddleware(req, res, next) {
    const contentType = req.get('content-type') || '';
    
    // Only capture raw body for protobuf requests
    if (contentType.includes('application/x-protobuf')) {
      const chunks = [];
      
      req.on('data', chunk => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        req.rawBody = Buffer.concat(chunks);
        next();
      });

      req.on('error', error => {
        next(error);
      });
    } else {
      // For JSON, let express.json() handle it
      next();
    }
  };
}

module.exports = {
  createContentParserMiddleware,
  createRawBodyMiddleware
};

