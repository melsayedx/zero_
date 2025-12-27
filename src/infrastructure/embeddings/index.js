/**
 * Embedding Infrastructure
 * 
 * Exports embedding providers for vector search functionality.
 */

const EmbeddingProviderContract = require('../../domain/contracts/embedding-provider.contract');
const TransformersProvider = require('./transformers-provider');
const OpenAIProvider = require('./openai-provider');

module.exports = {
    EmbeddingProviderContract,
    TransformersProvider,
    OpenAIProvider
};
