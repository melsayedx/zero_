/**
 * Handles natural language queries for log search using embeddings.
 *
 * @example
 * ```javascript
 * const result = await semanticSearch.execute({ query: 'auth error', appId: 'app1' });
 * ```
 */
class SemanticSearchUseCase {
    /**
     * @param {Object} repository
     * @param {EmbeddingProviderContract} embeddingProvider
     * @param {Object} logger
     */
    constructor(repository, embeddingProvider, logger) {
        this.repository = repository;
        this.provider = embeddingProvider;
        this.logger = logger;
    }

    /**
     * Execute semantic search.
     * @param {Object} params - Search parameters including query and filters
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

        const startTime = performance.now();

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

            const latencyMs = performance.now() - startTime;

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
