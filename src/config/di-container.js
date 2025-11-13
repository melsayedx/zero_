const { createClickHouseClient } = require('./database');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../core/use-cases/get-logs-by-app-id.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController } = require('../adapters/http/controllers');
const { StatsController } = require('../adapters/http/controllers');
const { IngestLogsHandler, HealthCheckHandler, GetLogsByAppIdHandler } = require('../adapters/grpc/handlers');
const ValidationService = require('../adapters/workers/validation-service');

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

    // Validation Service (with worker threads)
    this.instances.validationService = new ValidationService({
      smallBatchThreshold: parseInt(process.env.VALIDATION_SMALL_BATCH_THRESHOLD) || 50,
      mediumBatchThreshold: parseInt(process.env.VALIDATION_MEDIUM_BATCH_THRESHOLD) || 500,
      largeBatchThreshold: parseInt(process.env.VALIDATION_LARGE_BATCH_THRESHOLD) || 2000,
      enableWorkerValidation: process.env.ENABLE_WORKER_VALIDATION !== 'false',
      forceWorkerValidation: process.env.FORCE_WORKER_VALIDATION === 'true',
      workerPool: {
        minWorkers: parseInt(process.env.WORKER_POOL_MIN_WORKERS) || 2,
        maxWorkers: parseInt(process.env.WORKER_POOL_MAX_WORKERS) || Math.min(require('os').cpus().length, 8),
        taskTimeout: parseInt(process.env.WORKER_TASK_TIMEOUT) || 30000
      }
    });

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
      this.instances.ingestLogUseCase,
      this.instances.validationService
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
   * Get all HTTP controllers
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
   * Flushes batch buffer, shuts down workers, and closes connections
   */
  async cleanup() {
    // First, flush the batch buffer to ensure all logs are saved
    if (this.instances.logRepository) {
      console.log('[DIContainer] Flushing log buffer...');
      await this.instances.logRepository.shutdown();
    }
    
    // Shutdown validation service (worker pool)
    if (this.instances.validationService) {
      console.log('[DIContainer] Shutting down worker pool...');
      await this.instances.validationService.shutdown();
    }
    
    // Then close ClickHouse connection
    if (this.instances.clickhouseClient) {
      console.log('[DIContainer] Closing ClickHouse connection...');
      await this.instances.clickhouseClient.close();
    }
  }
}

module.exports = DIContainer;

