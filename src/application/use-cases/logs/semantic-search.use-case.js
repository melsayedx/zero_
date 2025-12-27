/**
 * Semantic Search Use Case
 * 
 * Handles natural language queries for log search.
 * Converts user query to embedding, searches for similar logs,
 * and returns results with optional metadata filtering.
 * 
 * @example
 * ```javascript
 * const result = await semanticSearch.execute({
 *   query: 'authentication failures in payment service',
 *   appId: 'my-app',
 *   limit: 20,
 *   filters: {
 *     level: ['ERROR', 'WARN'],
 *     timeRange: { start: '2024-01-01', end: '2024-01-31' }
 *   }
 * });
 * ```
 */
class SemanticSearchUseCase {
    /**
     * @param {Object} repository - ClickHouse repository with findSimilar method
     * @param {EmbeddingProviderContract} embeddingProvider - Embedding provider
     * @param {Object} logger - Logger instance
     */
    constructor(repository, embeddingProvider, logger) {
        if (!repository || typeof repository.findSimilar !== 'function') {
            throw new Error('Repository with findSimilar method is required');
        }
        if (!embeddingProvider) {
            throw new Error('Embedding provider is required');
        }

        this.repository = repository;
        this.provider = embeddingProvider;
        this.logger = logger;
    }

    /**
     * Execute semantic search.
     * 
     * @param {Object} params - Search parameters
     * @param {string} params.query - Natural language query
     * @param {string} [params.appId] - Filter by app_id
     * @param {number} [params.limit=20] - Max results to return
     * @param {Object} [params.filters] - Additional filters
     * @param {string[]} [params.filters.level] - Filter by log levels
     * @param {Object} [params.filters.timeRange] - Filter by time range
     * @returns {Promise<Object>} Search results with logs and metadata
     */
    async execute({ query, appId, limit = 20, filters = {} }) {
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return {
                success: false,
                error: 'Query string is required',
                logs: []
            };
        }

        const startTime = Date.now();

        try {
            // Generate embedding for query
            const [queryEmbedding] = await this.provider.embed([query.trim()]);

            if (!queryEmbedding || queryEmbedding.length === 0) {
                return {
                    success: false,
                    error: 'Failed to generate query embedding',
                    logs: []
                };
            }

            // Search for similar logs
            const results = await this.repository.findSimilar(queryEmbedding, {
                appId,
                limit,
                ...filters
            });

            const latencyMs = Date.now() - startTime;

            this.logger.info('Semantic search completed', {
                query: query.substring(0, 100),
                resultCount: results.length,
                latencyMs
            });

            return {
                success: true,
                query,
                logs: results,
                metadata: {
                    count: results.length,
                    limit,
                    latencyMs,
                    provider: this.provider.getName()
                }
            };
        } catch (error) {
            this.logger.error('Semantic search failed', { error, query });
            return {
                success: false,
                error: error.message,
                logs: []
            };
        }
    }
}

module.exports = SemanticSearchUseCase;
