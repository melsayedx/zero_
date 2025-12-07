/**
 * Content Parser Plugin for Fastify
 * Handles parsing of both JSON and Protocol Buffer formats
 * Maintains backward compatibility with existing JSON API
 */

const ProtobufParser = require('./protobuf-parser');
const fp = require('fastify-plugin');

/**
 * Fastify plugin to add content type parsers for JSON and Protocol Buffer formats
 * Supports:
 * - application/json
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
  const initPromise = ProtobufParser.getInstance()
    .then(parser => {
      protobufParser = parser;
      console.log('[ContentParser] Protobuf parser initialized');
    })
    .catch(error => {
      console.error('[ContentParser] Failed to initialize protobuf parser:', error);
      next(error);
    });

  /**
   * Shared protobuf parsing logic for both single and batch entries
   * @param {Object} request - Fastify request
   * @param {Buffer} payload - Binary protobuf data
   * @param {boolean} isBatch - Whether this is a batch request
   */
  async function parseProtobuf(request, payload, isBatch) {
    await initPromise;

    if (!protobufParser) {
      throw new Error('Protocol Buffer parser not available');
    }

    const formatLabel = isBatch ? 'protobuf-batch' : 'protobuf-single';

    // Try worker-based decoding for large payloads
    let decodedData = null;
    if (validationService) {
      decodedData = await validationService.decodeProtobuf(payload, isBatch);
    }

    // Fallback to main thread if worker not used or failed
    if (!decodedData) {
      decodedData = isBatch
        ? protobufParser.decodeBatch(payload)
        : protobufParser.decodeSingleEntry(payload);
      request.contentFormat = formatLabel;
    } else {
      request.contentFormat = `${formatLabel}-worker`;
    }

    return decodedData;
  }

  // Single protobuf entry parser
  fastify.addContentTypeParser('application/x-protobuf', { parseAs: 'buffer' },
    async (request, payload) => {
      try {
        return await parseProtobuf(request, payload, false);
      } catch (error) {
        console.error('[ContentParser] Error parsing protobuf single entry:', error);
        throw error;
      }
    }
  );

  // Batch protobuf entries parser
  fastify.addContentTypeParser('application/x-protobuf-batch', { parseAs: 'buffer' },
    async (request, payload) => {
      try {
        return await parseProtobuf(request, payload, true);
      } catch (error) {
        console.error('[ContentParser] Error parsing protobuf batch:', error);
        throw error;
      }
    }
  );

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

