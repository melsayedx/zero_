const { createClickHouseClient } = require('./database');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const { IngestLogController, HealthCheckController } = require('../adapters/http/controllers');

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

    // Controllers
    this.instances.ingestLogController = new IngestLogController(
      this.instances.ingestLogUseCase
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

