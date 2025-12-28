/**
 * OpenAIProvider - API-based OpenAI embedding provider (text-embedding-3-small/large).
 */
const EmbeddingProviderContract = require('../../domain/contracts/embedding-provider.contract');
const { LoggerFactory } = require('../logging');

class OpenAIProvider extends EmbeddingProviderContract {
    constructor(options = {}) {
        super();
        this.apiKey = options.apiKey;
        this.model = options.model || 'text-embedding-3-small';
        this.dimension = options.dimension || 1536; // text-embedding-3-small default
        this.logger = options.logger || LoggerFactory.child({ component: 'OpenAIProvider' });
        this.batchSize = options.batchSize || 100; // OpenAI supports up to 2048
    }

    async initialize() {
        if (!this.apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY env variable.');
        }
        this.logger.info('OpenAI embedding provider initialized', { model: this.model });
    }

    /**
     * Generate embeddings using OpenAI API
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors
     */
    async embed(texts) {
        if (!this.apiKey) {
            throw new Error('OpenAI provider not initialized. Call initialize() first.');
        }

        if (!Array.isArray(texts) || texts.length === 0) {
            return [];
        }

        const allEmbeddings = [];

        // Process in batches
        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);

            try {
                const response = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.model,
                        input: batch,
                        dimensions: this.dimension
                    })
                });

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
                }

                const data = await response.json();
                const batchEmbeddings = data.data
                    .sort((a, b) => a.index - b.index)
                    .map(item => item.embedding);

                allEmbeddings.push(...batchEmbeddings);
            } catch (error) {
                this.logger.error('Failed to get OpenAI embeddings', { error });
                // Fill with zero vectors on error
                for (let j = 0; j < batch.length; j++) {
                    allEmbeddings.push(new Array(this.dimension).fill(0));
                }
            }
        }

        return allEmbeddings;
    }

    getDimension() {
        return this.dimension;
    }

    getName() {
        return 'openai';
    }

    async shutdown() {
        this.logger.info('OpenAI provider shutdown');
    }
}

module.exports = OpenAIProvider;
