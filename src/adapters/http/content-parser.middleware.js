/**
 * Content Parser Plugin for Fastify
 * Handles parsing of both JSON and Protocol Buffer formats
 * Maintains backward compatibility with existing JSON API
 */

const { getProtobufParser } = require('./protobuf-parser');
const fp = require('fastify-plugin');

/**
 * Fastify plugin to add content type parsers for JSON and Protocol Buffer formats
 * Supports:
 * - application/json (backward compatible)
 * - application/x-protobuf (single entry)
 * - application/x-protobuf-batch (batch of entries)
 *
 * Uses worker threads for large protobuf payloads to prevent event loop blocking
 *
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Plugin options
 * @param {ValidationService} options.validationService - Optional validation service for worker-based parsing
 * @param {Function} next - Next callback
 */
function contentParserPlugin(fastify, options, next) {
  const { validationService = null } = options;
  let protobufParser = null;

  // Initialize protobuf parser once
  const initPromise = getProtobufParser()
    .then(parser => {
      protobufParser = parser;
      console.log('[ContentParser] Protobuf parser initialized');
    })
    .catch(error => {
      console.error('[ContentParser] Failed to initialize protobuf parser:', error);
      next(error);
    });

  // Add content type parser for single protobuf entries
  fastify.addContentTypeParser('application/x-protobuf', { parseAs: 'buffer' },
    async (request, payload) => {
      try {
        // Ensure protobuf parser is initialized
        await initPromise;

        if (!protobufParser) {
          throw new Error('Protocol Buffer parser not available');
        }

        // Try worker-based decoding for large payloads
        let decodedData = null;
        if (validationService) {
          decodedData = await validationService.decodeProtobuf(payload, false);
        }

        // Fallback to main thread if worker not used or failed
        if (!decodedData) {
          const singleEntry = protobufParser.decodeSingleEntry(payload);
          decodedData = [singleEntry]; // Wrap in array for consistency
          request.contentFormat = 'protobuf-single';
        } else {
          // Data decoded by worker
          request.contentFormat = 'protobuf-single-worker';
          // Ensure array format
          if (!Array.isArray(decodedData)) {
            decodedData = [decodedData];
          }
        }

        return decodedData;
      } catch (error) {
        console.error('[ContentParser] Error parsing protobuf single entry:', error);
        throw error;
      }
    }
  );

  // Add content type parser for batch protobuf entries
  fastify.addContentTypeParser('application/x-protobuf-batch', { parseAs: 'buffer' },
    async (request, payload) => {
      try {
        // Ensure protobuf parser is initialized
        await initPromise;

        if (!protobufParser) {
          throw new Error('Protocol Buffer parser not available');
        }

        // Try worker-based decoding for large payloads
        let decodedData = null;
        if (validationService) {
          decodedData = await validationService.decodeProtobuf(payload, true);
        }

        // Fallback to main thread if worker not used or failed
        if (!decodedData) {
          decodedData = protobufParser.decodeBatch(payload);
          request.contentFormat = 'protobuf-batch';
        } else {
          // Data decoded by worker
          request.contentFormat = 'protobuf-batch-worker';
          // Ensure array format
          if (!Array.isArray(decodedData)) {
            decodedData = [decodedData];
          }
        }

        return decodedData;
      } catch (error) {
        console.error('[ContentParser] Error parsing protobuf batch:', error);
        throw error;
      }
    }
  );

  // Hook to set content format for JSON requests
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method === 'POST' && request.headers['content-type']?.includes('application/json')) {
      // Ensure req.body is an array for consistency
      if (request.body && !Array.isArray(request.body)) {
        request.body = [request.body];
      }
      request.contentFormat = 'json';
    }
  });

  next();
}

/**
 * Factory function for creating content parser plugin
 * @param {ValidationService} validationService - Optional validation service for worker-based parsing
 * @returns {Function} Fastify plugin
 */
function createContentParserMiddleware(validationService = null) {
  return fp((fastify, options, next) => {
    contentParserPlugin(fastify, { validationService, ...options }, next);
  });
}

module.exports = createContentParserMiddleware;

