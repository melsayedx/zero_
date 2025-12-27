/**
 * Embedding Provider Contract
 * 
 * Interface for embedding providers (local transformers.js, OpenAI, etc.)
 * Enables swapping between providers without changing application code.
 */
class EmbeddingProviderContract {
    /**
     * Generate embeddings for an array of texts
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors
     */
    async embed(texts) {
        throw new Error('embed() must be implemented by subclass');
    }

    /**
     * Get the embedding dimension for this provider
     * @returns {number} Dimension of embedding vectors
     */
    getDimension() {
        throw new Error('getDimension() must be implemented by subclass');
    }

    /**
     * Get provider name for logging
     * @returns {string} Provider identifier
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }

    /**
     * Initialize the provider (load models, etc.)
     * @returns {Promise<void>}
     */
    async initialize() {
        // Optional: override in subclass
    }

    /**
     * Cleanup resources
     * @returns {Promise<void>}
     */
    async shutdown() {
        // Optional: override in subclass
    }
}

module.exports = EmbeddingProviderContract;
