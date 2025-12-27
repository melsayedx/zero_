/**
 * Embedding Worker - Async background worker for generating log embeddings.
 * 
 * Polls ClickHouse for logs without embeddings, generates vector embeddings
 * using the configured provider, and stores them for semantic search.
 * 
 * Architecture:
 * 1. Query logs table for recent logs without embeddings
 * 2. Combine level + source + message into embeddable text
 * 3. Generate embeddings via provider (transformers.js or API)
 * 4. Insert embeddings into log_embeddings table
 * 5. Handle errors gracefully (skip failed logs, continue processing)
 */
const { LoggerFactory } = require('../logging');

class EmbeddingWorker {
    /**
     * Create an EmbeddingWorker instance.
     * 
     * @param {Object} clickhouseClient - ClickHouse client instance
     * @param {EmbeddingProviderContract} embeddingProvider - Embedding provider
     * @param {Object} options - Configuration options
     */
    constructor(clickhouseClient, embeddingProvider, options = {}) {
        if (!clickhouseClient) {
            throw new Error('ClickHouse client is required');
        }
        if (!embeddingProvider) {
            throw new Error('Embedding provider is required');
        }

        this.clickhouse = clickhouseClient;
        this.provider = embeddingProvider;
        this.logger = options.logger || LoggerFactory.named('EmbeddingWorker');

        // Configuration
        this.batchSize = options.batchSize || 100;
        this.pollIntervalMs = options.pollIntervalMs || 5000;
        this.logsTable = options.logsTable || 'logs_db.logs';
        this.embeddingsTable = options.embeddingsTable || 'logs_db.log_embeddings';
        this.lookbackMinutes = options.lookbackMinutes || 60; // Process logs from last hour

        // Worker state
        this.isRunning = false;
        this.isProcessing = false;
        this.stats = {
            processed: 0,
            failed: 0,
            lastProcessedAt: null
        };
    }

    /**
     * Start the embedding worker.
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('Embedding worker already running');
            return;
        }

        this.logger.info('Starting embedding worker', {
            provider: this.provider.getName(),
            dimension: this.provider.getDimension(),
            batchSize: this.batchSize
        });

        // Initialize the embedding provider (downloads model if needed)
        await this.provider.initialize();

        this.isRunning = true;
        this._pollLoop();
    }

    /**
     * Stop the embedding worker gracefully.
     */
    async stop() {
        this.logger.info('Stopping embedding worker...');
        this.isRunning = false;

        // Wait for current batch to complete
        while (this.isProcessing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await this.provider.shutdown();
        this.logger.info('Embedding worker stopped', { stats: this.stats });
    }

    /**
     * Main polling loop.
     * @private
     */
    async _pollLoop() {
        while (this.isRunning) {
            try {
                const count = await this._processBatch();

                // If we processed a full batch, immediately try again
                if (count >= this.batchSize) {
                    continue;
                }

                // Otherwise, wait before polling again
                await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
            } catch (error) {
                this.logger.error('Error in embedding poll loop', { error });
                // Backoff on error
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    /**
     * Process a batch of unembedded logs.
     * @private
     * @returns {Promise<number>} Number of logs processed
     */
    async _processBatch() {
        if (this.isProcessing) {
            return 0;
        }

        this.isProcessing = true;

        try {
            // Find logs without embeddings
            const logs = await this._fetchUnembeddedLogs();

            if (logs.length === 0) {
                return 0;
            }

            this.logger.debug('Processing unembedded logs', { count: logs.length });

            // Generate text for embedding
            const textsToEmbed = logs.map(log => this._formatLogForEmbedding(log));

            // Generate embeddings
            const embeddings = await this.provider.embed(textsToEmbed);

            // Insert embeddings into ClickHouse
            await this._insertEmbeddings(logs, embeddings, textsToEmbed);

            this.stats.processed += logs.length;
            this.stats.lastProcessedAt = new Date().toISOString();

            this.logger.info('Embedded logs', {
                count: logs.length,
                totalProcessed: this.stats.processed
            });

            return logs.length;
        } catch (error) {
            this.logger.error('Batch embedding failed', { error });
            this.stats.failed++;
            return 0;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Fetch logs that don't have embeddings yet.
     * @private
     */
    async _fetchUnembeddedLogs() {
        const query = `
      SELECT 
        l.id,
        l.app_id,
        l.timestamp,
        l.level,
        l.source,
        l.message
      FROM ${this.logsTable} l
      LEFT JOIN ${this.embeddingsTable} e ON l.id = e.log_id
      WHERE 
        e.log_id IS NULL
        AND l.timestamp >= now() - INTERVAL ${this.lookbackMinutes} MINUTE
      ORDER BY l.timestamp DESC
      LIMIT ${this.batchSize}
    `;

        const result = await this.clickhouse.query({
            query,
            format: 'JSONEachRow'
        });

        return result.json();
    }

    /**
     * Format a log entry for embedding.
     * Combines level, source, and message for rich semantic context.
     * @private
     */
    _formatLogForEmbedding(log) {
        // Format: [LEVEL] source: message
        // Example: [ERROR] payment-service: Connection timeout after 30s
        return `[${log.level}] ${log.source}: ${log.message}`;
    }

    /**
     * Insert embeddings into ClickHouse.
     * @private
     */
    async _insertEmbeddings(logs, embeddings, texts) {
        const rows = logs.map((log, i) => ({
            log_id: log.id,
            app_id: log.app_id,
            timestamp: log.timestamp,
            embedding: embeddings[i],
            embedded_text: texts[i]
        }));

        await this.clickhouse.insert({
            table: this.embeddingsTable,
            values: rows,
            format: 'JSONEachRow'
        });
    }

    /**
     * Get worker health and statistics.
     */
    getHealth() {
        return {
            isRunning: this.isRunning,
            isProcessing: this.isProcessing,
            provider: this.provider.getName(),
            dimension: this.provider.getDimension(),
            stats: this.stats
        };
    }
}

module.exports = EmbeddingWorker;
