const { createClickHouseClient } = require('./database');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const IngestLogsBatchUseCase = require('../core/use-cases/ingest-logs-batch.use-case');
const { IngestLogController, IngestLogsBatchController, HealthCheckController } = require('../adapters/http/controllers');

/**
 * Simple Dependency Injection Container
 * Wires up all dependencies manually
 */
class DIContainer {
  constructor() {
    this.instances = {};
  }

  /**
   * Initialize all dependencies
   */
  initialize() {
    // Database
    this.instances.clickhouseClient = createClickHouseClient();

    // Repositories
    this.instances.logRepository = new ClickHouseRepository(
      this.instances.clickhouseClient
    );

    // Use Cases
    this.instances.ingestLogUseCase = new IngestLogUseCase(
      this.instances.logRepository
    );

    this.instances.ingestLogsBatchUseCase = new IngestLogsBatchUseCase(
      this.instances.logRepository
    );

    // Controllers
    this.instances.ingestLogController = new IngestLogController(
      this.instances.ingestLogUseCase
    );

    this.instances.ingestLogsBatchController = new IngestLogsBatchController(
      this.instances.ingestLogsBatchUseCase
    );

    this.instances.healthCheckController = new HealthCheckController(
      this.instances.logRepository
    );
  }

  /**
   * Get a dependency by name
   * @param {string} name - Dependency name
   * @returns {*} The dependency instance
   */
  get(name) {
    if (!this.instances[name]) {
      throw new Error(`Dependency not found: ${name}`);
    }
    return this.instances[name];
  }

  /**
   * Get all controllers
   * @returns {Object} Controllers object
   */
  getControllers() {
    return {
      ingestLogController: this.get('ingestLogController'),
      ingestLogsBatchController: this.get('ingestLogsBatchController'),
      healthCheckController: this.get('healthCheckController')
    };
  }

  /**
   * Cleanup resources (useful for graceful shutdown)
   */
  async cleanup() {
    if (this.instances.clickhouseClient) {
      await this.instances.clickhouseClient.close();
    }
  }
}

module.exports = DIContainer;

