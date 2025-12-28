/**
 * In-flight marker to prevent race conditions.
 * @type {string}
 */
const PROCESSING_MARKER = '__PROCESSING__';

/**
 * Creates idempotency check (preHandler).
 * Implements in-flight locking to prevent race conditions when duplicate
 * requests arrive before the first one completes.
 * @param {IdempotencyContract} idempotencyStore - Store.
 * @param {Logger} logger - Logger.
 * @param {Object} [options] - Options.
 * @param {number} [options.lockTtl=30] - In-flight lock TTL (seconds).
 * @returns {Function} Fastify preHandler.
 */
function createIdempotencyCheck(idempotencyStore, logger, options = {}) {
    const { headerName = 'idempotency-key', enforce = true, lockTtl = 30 } = options;
    const normalizedHeader = headerName.toLowerCase();

    return async function idempotencyCheck(request, reply) {
        const idempotencyKey = request.headers[normalizedHeader];

        if (!idempotencyKey) {
            if (enforce) {
                return reply.code(400).send({
                    success: false,
                    message: `Missing mandatory header: ${headerName}`
                });
            }
            return; // Proceed normally if not enforced
        }

        // Validate key format (prevent abuse)
        if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 128) {
            return reply.code(400).send({
                success: false,
                message: `Invalid ${headerName}: must be a string with max 128 characters`
            });
        }

        try {
            // ATOMIC LOCK ACQUISITION: Try to set PROCESSING_MARKER first
            // Redis SET NX returns true only for the first caller
            const lockAcquired = await idempotencyStore.set(idempotencyKey, PROCESSING_MARKER, lockTtl);

            if (lockAcquired) {
                // We got the lock - proceed with request
                // We set request.idempotencyKey to pass the key from preHandler to onSend
                request.idempotencyKey = idempotencyKey;
                logger.debug('Acquired in-flight lock, processing request', { key: idempotencyKey });
                return; // Proceed to controller
            }

            // Lock not acquired - key already exists (either cached response or in-flight)
            const cachedResponse = await idempotencyStore.get(idempotencyKey);

            // Check if it's a completed cached response
            if (cachedResponse && cachedResponse !== PROCESSING_MARKER) {
                logger.debug('Returning cached response', { key: idempotencyKey });
                return reply
                    .code(cachedResponse.statusCode || 200)
                    .headers(cachedResponse.headers || {})
                    .send(cachedResponse.rawPayload);
            }

            // It's the PROCESSING_MARKER (or was just deleted) - another request is in-flight
            logger.debug('Request in-flight, rejecting duplicate', { key: idempotencyKey });
            return reply.code(409).send({
                success: false,
                message: 'A request with this idempotency key is already being processed',
                retryAfter: lockTtl
            });
        } catch (error) {
            logger.error('Error in idempotency check', { error: error.message });
            // On error, allow request to proceed (fail-open behavior)
        }
    };
}

/**
 * Creates idempotency onSend hook.
 * @param {IdempotencyContract} idempotencyStore - Store.
 * @param {Logger} logger - Logger.
 * @param {Object} [options] - Options.
 * @param {number} [options.ttl] - TTL (seconds).
 */
function createIdempotencyHook(idempotencyStore, logger, options = {}) {
    const ttl = options.ttl;

    return async function idempotencyOnSend(request, reply, payload) {
        const idempotencyKey = request.idempotencyKey;

        // Only cache if we have an idempotency is enabled
        if (!idempotencyKey) {
            return payload;
        }

        const responseToCache = {
            statusCode: reply.statusCode,
            rawPayload: payload,
            headers: {
                'content-type': reply.getHeader('content-type')
            },
            cachedAt: new Date().toISOString()
        };

        idempotencyStore.set(idempotencyKey, responseToCache, ttl, { force: true })
            .then(() => {
                logger.debug('Cached response', { key: idempotencyKey });
            })
            .catch(error => {
                logger.error('Error caching response', { error: error.message });
            });

        return payload;
    };
}

module.exports = {
    createIdempotencyCheck,
    createIdempotencyHook
};
