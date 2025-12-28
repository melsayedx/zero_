/** Interface for embedding providers (local, API, etc). */
class EmbeddingProviderContract {
    /**
     * Generates embeddings for texts.
     * @param {string[]} texts - Texts to embed.
     * @returns {Promise<number[][]>} Embedding vectors.
     */
    async embed(texts) {
        throw new Error('embed() must be implemented by subclass');
    }

    /**
     * Returns embedding dimension.
     * @returns {number} Vector dimension.
     */
    getDimension() {
        throw new Error('getDimension() must be implemented by subclass');
    }

    /**
     * Returns provider name.
     * @returns {string} Provider identifier.
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }

    async initialize() {
        // Optional: override in subclass
    }

    async shutdown() {
        // Optional: override in subclass
    }
}

module.exports = EmbeddingProviderContract;
