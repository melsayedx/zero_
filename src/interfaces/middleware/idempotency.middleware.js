/**
 * Idempotency Middleware for Fastify
 *
 * This middleware checks for the `Idempotency-Key` header in incoming requests.
 * If present, it checks if a response is already cached for that key and returns
 * the cached response. Otherwise, it allows the request to proceed and caches
 * the response after completion.
 *
 * @example
 * ```javascript
 * const { createIdempotencyMiddleware, createIdempotencyHook } = require('./idempotency.middleware');
 *
 * // Create middleware with idempotency store
 * const idempotencyMiddleware = createIdempotencyMiddleware(idempotencyStore, { ttl: 86400 });
 * const idempotencyHook = createIdempotencyHook(idempotencyStore);
 *
 * // Apply to route
 * fastify.post('/api/logs', {
 *   preHandler: idempotencyMiddleware,
 *   onSend: idempotencyHook
 * }, handler);
 * ```
 */

/**
 * Create idempotency preHandler middleware for Fastify.
 *
 * This middleware checks if a response is cached for the Idempotency-Key header.
 * If cached, it returns the cached response immediately.
 * If not, it attaches the key to the request for later caching.
 *
 * @param {IdempotencyContract} idempotencyStore - Idempotency store instance
 * @param {Object} [options={}] - Configuration options
 * @param {string} [options.headerName='idempotency-key'] - Header name to check
 * @param {boolean} [options.enableLogging=false] - Enable debug logging
 * @returns {Function} Fastify preHandler function
 */
function createIdempotencyMiddleware(idempotencyStore, options = {}) {
    const headerName = (options.headerName || 'idempotency-key').toLowerCase();
    const enableLogging = options.enableLogging || false;

    return async function idempotencyMiddleware(request, reply) {
        // Get idempotency key from header (case-insensitive)
        const idempotencyKey = request.headers[headerName];

        // If no key provided, proceed normally (optional idempotency)
        if (!idempotencyKey) {
            return;
        }

        // Validate key format (prevent abuse)
        if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 128) {
            return reply.code(400).send({
                success: false,
                message: 'Invalid Idempotency-Key: must be a string with max 128 characters'
            });
        }

        try {
            // Check if we have a cached response
            const cachedResponse = await idempotencyStore.get(idempotencyKey);

            if (cachedResponse) {
                if (enableLogging) {
                    console.log(`[IdempotencyMiddleware] Returning cached response for key: ${idempotencyKey}`);
                }

                // Return cached response
                return reply
                    .code(cachedResponse.statusCode || 200)
                    .headers(cachedResponse.headers || {})
                    .send(cachedResponse.body);
            }

            // Store key on request for later caching in onSend hook
            request.idempotencyKey = idempotencyKey;

            if (enableLogging) {
                console.log(`[IdempotencyMiddleware] Processing new request with key: ${idempotencyKey}`);
            }
        } catch (error) {
            console.error('[IdempotencyMiddleware] Error checking idempotency:', error.message);
            // Fail open - allow request to proceed
        }
    };
}

/**
 * Create idempotency onSend hook for Fastify.
 *
 * This hook caches the response after it's been generated, using the
 * Idempotency-Key stored on the request by the preHandler middleware.
 *
 * @param {IdempotencyContract} idempotencyStore - Idempotency store instance
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.ttl] - TTL in seconds (uses store default if not provided)
 * @param {boolean} [options.enableLogging=false] - Enable debug logging
 * @returns {Function} Fastify onSend hook function
 */
function createIdempotencyHook(idempotencyStore, options = {}) {
    const ttl = options.ttl;
    const enableLogging = options.enableLogging || false;

    return async function idempotencyOnSend(request, reply, payload) {
        // Only cache if we have an idempotency key
        const idempotencyKey = request.idempotencyKey;

        if (!idempotencyKey) {
            return payload;
        }

        // Parse payload if it's a string
        let body;
        try {
            body = typeof payload === 'string' ? JSON.parse(payload) : payload;
        } catch {
            body = payload;
        }

        // Cache the response (fire-and-forget - don't block the response)
        const responseToCache = {
            statusCode: reply.statusCode,
            body: body,
            headers: {
                'content-type': reply.getHeader('content-type')
            },
            cachedAt: new Date().toISOString()
        };

        // Non-blocking cache write - errors are logged but don't affect response
        idempotencyStore.set(idempotencyKey, responseToCache, ttl)
            .then(() => {
                if (enableLogging) {
                    console.log(`[IdempotencyMiddleware] Cached response for key: ${idempotencyKey}`);
                }
            })
            .catch(error => {
                console.error('[IdempotencyMiddleware] Error caching response:', error.message);
            });

        return payload;
    };
}

module.exports = {
    createIdempotencyMiddleware,
    createIdempotencyHook
};
