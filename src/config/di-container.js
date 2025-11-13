const { createClickHouseClient } = require('./database');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../core/use-cases/get-logs-by-app-id.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController } = require('../adapters/http/controllers');
const { IngestLogsHandler, HealthCheckHandler, GetLogsByAppIdHandler } = require('../adapters/grpc/handlers');

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

    // HTTP Controllers
    this.instances.ingestLogController = new IngestLogController(
      this.instances.ingestLogUseCase
    );

    this.instances.healthCheckController = new HealthCheckController(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdController = new GetLogsByAppIdController(
      this.instances.getLogsByAppIdUseCase
    );

    // gRPC Handlers
    this.instances.ingestLogsHandler = new IngestLogsHandler(
      this.instances.ingestLogUseCase
    );

    this.instances.healthCheckHandler = new HealthCheckHandler(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdHandler = new GetLogsByAppIdHandler(
      this.instances.getLogsByAppIdUseCase
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
   * Get all HTTP controllers
   * @returns {Object} Controllers object
   */
  getControllers() {
    return {
      ingestLogController: this.get('ingestLogController'),
      healthCheckController: this.get('healthCheckController'),
      getLogsByAppIdController: this.get('getLogsByAppIdController')
    };
  }

  /**
   * Get all gRPC handlers
   * @returns {Object} Handlers object
   */
  getHandlers() {
    return {
      ingestLogsHandler: this.get('ingestLogsHandler'),
      healthCheckHandler: this.get('healthCheckHandler'),
      getLogsByAppIdHandler: this.get('getLogsByAppIdHandler')
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

