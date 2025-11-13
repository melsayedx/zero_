const { createClickHouseClient } = require('./database');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../core/use-cases/get-logs-by-app-id.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController, StatsController } = require('../adapters/http/controllers');

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

    this.instances.getLogsByAppIdUseCase = new GetLogsByAppIdUseCase(
      this.instances.logRepository
    );

    // Controllers
    this.instances.ingestLogController = new IngestLogController(
      this.instances.ingestLogUseCase
    );

    this.instances.healthCheckController = new HealthCheckController(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdController = new GetLogsByAppIdController(
      this.instances.getLogsByAppIdUseCase
    );

    this.instances.statsController = new StatsController(
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
      healthCheckController: this.get('healthCheckController'),
      getLogsByAppIdController: this.get('getLogsByAppIdController'),
      statsController: this.get('statsController')
    };
  }

  /**
   * Cleanup resources (useful for graceful shutdown)
   * Flushes batch buffer and closes connections
   */
  async cleanup() {
    // First, flush the batch buffer to ensure all logs are saved
    if (this.instances.logRepository) {
      console.log('[DIContainer] Flushing log buffer...');
      await this.instances.logRepository.shutdown();
    }
    
    // Then close ClickHouse connection
    if (this.instances.clickhouseClient) {
      console.log('[DIContainer] Closing ClickHouse connection...');
      await this.instances.clickhouseClient.close();
    }
  }
}

module.exports = DIContainer;

