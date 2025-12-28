const ProtobufParser = require('../parser/protobuf-parser');
const fp = require('fastify-plugin');

/**
 * Adds content type parsers for Protobuf.
 * @param {FastifyInstance} fastify - Fastify instance.
 * @param {Object} options - Options.
 * @param {ValidationService} [options.validationService] - Validation service.
 * @param {Logger} [options.logger] - Logger.
 * @param {Function} next - Callback.
 */
function contentParserPlugin(fastify, options, next) {
  const { validationService = null, logger } = options;
  let protobufParser = null;

  // Initialize protobuf parser once
  const initPromise = ProtobufParser.getInstance()
    .then(parser => {
      protobufParser = parser;
      logger.info('Protobuf parser initialized');
    })
    .catch(error => {
      logger.error('Failed to initialize protobuf parser', { error });
      next(error);
    });

  /**
   * Parses protobuf payload.
   * @param {Object} request - Request.
   * @param {Buffer} payload - Payload.
   * @param {boolean} isBatch - Batch flag.
   */
  async function parseProtobuf(request, payload, isBatch) {
    if (!protobufParser) {
      await initPromise;
    }

    if (!protobufParser) {
      throw new Error('Protocol Buffer parser not available');
    }

    const formatLabel = isBatch ? 'protobuf-batch' : 'protobuf-single';
    let usedWorker = false;

    let decodedData = null;
    if (validationService) {
      decodedData = await validationService.decodeProtobuf(payload, isBatch);
      usedWorker = !!decodedData;
    }

    if (!decodedData) {
      decodedData = isBatch
        ? protobufParser.decodeBatch(payload)
        : protobufParser.decodeSingleEntry(payload);
    }

    request.contentFormat = usedWorker ? `${formatLabel}-worker` : formatLabel;
    return decodedData;
  }

  fastify.addContentTypeParser(
    ['application/x-protobuf', 'application/x-protobuf-batch'],
    { parseAs: 'buffer' },
    async (request, payload) => {
      const isBatch = request.headers['content-type'] === 'application/x-protobuf-batch';
      try {
        return await parseProtobuf(request, payload, isBatch);
      } catch (error) {
        logger.error('Error parsing protobuf', { error, isBatch });
        throw error;
      }
    }
  );

  next();
}

/**
 * Creates content parser plugin.
 * @param {ValidationService} [validationService] - Validation service.
 * @param {Object} rootLogger - Logger.
 * @returns {Function} Plugin.
 */
function createContentParserPlugin(validationService = null, logger) {
  return fp((fastify, options, next) => {
    contentParserPlugin(fastify, { validationService, logger, ...options }, next);
  });
}

module.exports = createContentParserPlugin;

