/**
 * Transformers.js Embedding Provider
 * 
 * Local embedding provider using Hugging Face transformers.js
 * Runs sentence-transformers model locally without external API calls.
 * 
 * Model: all-MiniLM-L6-v2 (384 dimensions)
 * First run will download the model (~80MB), then cached locally.
 */
const EmbeddingProviderContract = require('../../domain/contracts/embedding-provider.contract');
const { LoggerFactory } = require('../logging');

class TransformersProvider extends EmbeddingProviderContract {
    constructor(options = {}) {
        super();
        this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
        this.dimension = 384; // all-MiniLM-L6-v2 output dimension
        this.pipeline = null;
        this.logger = options.logger || LoggerFactory.named('TransformersProvider');
        this.batchSize = options.batchSize || 32; // Process texts in batches
    }

    /**
     * Initialize the embedding pipeline
     * Lazily loads transformers.js to avoid startup overhead
     */
    async initialize() {
        if (this.pipeline) {
            return;
        }

        this.logger.info('Initializing transformers.js embedding pipeline', {
            model: this.modelName
        });

        try {
            // Dynamic import for ESM module
            const { pipeline } = await import('@huggingface/transformers');

            this.pipeline = await pipeline('feature-extraction', this.modelName, {
                // Use default quantized model for faster inference
                quantized: true
            });

            this.logger.info('Embedding pipeline initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize embedding pipeline', { error });
            throw error;
        }
    }

    /**
     * Generate embeddings for an array of texts
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors (384 dimensions each)
     */
    async embed(texts) {
        if (!this.pipeline) {
            await this.initialize();
        }

        if (!Array.isArray(texts) || texts.length === 0) {
            return [];
        }

        const allEmbeddings = [];

        // Process in batches to manage memory
        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);
            const batchEmbeddings = await this._embedBatch(batch);
            allEmbeddings.push(...batchEmbeddings);
        }

        return allEmbeddings;
    }

    /**
     * Embed a single batch of texts
     * @private
     */
    async _embedBatch(texts) {
        const embeddings = [];

        for (const text of texts) {
            try {
                // Run the model - returns tensor with shape [1, tokens, 384]
                const output = await this.pipeline(text, {
                    pooling: 'mean',  // Mean pooling over tokens
                    normalize: true   // L2 normalize for cosine similarity
                });

                // Extract the embedding array
                const embedding = Array.from(output.data);
                embeddings.push(embedding);
            } catch (error) {
                this.logger.error('Failed to embed text', {
                    error,
                    textLength: text?.length
                });
                // Return zero vector on error to maintain array alignment
                embeddings.push(new Array(this.dimension).fill(0));
            }
        }

        return embeddings;
    }

    /**
     * Get the embedding dimension
     * @returns {number} 384 for all-MiniLM-L6-v2
     */
    getDimension() {
        return this.dimension;
    }

    /**
     * Get provider name
     * @returns {string}
     */
    getName() {
        return 'transformers.js';
    }

    /**
     * Cleanup resources
     */
    async shutdown() {
        this.pipeline = null;
        this.logger.info('Transformers provider shutdown');
    }
}

module.exports = TransformersProvider;
