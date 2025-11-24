const { createClickHouseClient } = require('./clickhouse');
const mongoDBConnection = require('./mongodb');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const RedisLogRepository = require('../adapters/repositories/redis-log.repository');
const UserRepository = require('../adapters/repositories/user.repository');
const AppRepository = require('../adapters/repositories/app.repository');
const IngestLogUseCase = require('../core/use-cases/logs/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../core/use-cases/logs/get-logs-by-app-id.use-case');
const RegisterUserUseCase = require('../core/use-cases/auth/register-user.use-case');
const LoginUserUseCase = require('../core/use-cases/auth/login-user.use-case');
const CreateAppUseCase = require('../core/use-cases/apps/create-app.use-case');
const ListUserAppsUseCase = require('../core/use-cases/apps/list-user-apps.use-case');
const VerifyAppAccessUseCase = require('../core/use-cases/apps/verify-app-access.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController } = require('../adapters/http/controllers');
const { StatsController } = require('../adapters/http/controllers');
const { RegisterController, LoginController, MeController } = require('../adapters/http/auth.controllers');
const { CreateAppController, ListAppsController, GetAppController } = require('../adapters/http/app.controllers');
const { IngestLogsHandler, HealthCheckHandler, GetLogsByAppIdHandler } = require('../adapters/grpc/handlers');
const ValidationService = require('../adapters/workers/validation-service');
const LogProcessorWorker = require('../adapters/workers/log-processor.worker');
const OptimizedIngestService = require('../core/services/optimized-ingest.service');
const { BufferPool } = require('../core/utils/buffer-utils');
const { getRedisClient, closeRedisConnection } = require('./redis');

/**
 * @typedef {Object} DIContainerInstances
 * @property {import('../config/database').ClickHouseClient} clickhouseClient - ClickHouse database client
 * @property {BufferPool} bufferPool - Buffer pool for zero-copy operations
 * @property {ValidationService} validationService - Validation service with worker threads
 * @property {LogProcessorWorker} logProcessorWorker - Worker to move logs from Redis to ClickHouse
 * @property {ClickHouseRepository} clickhouseRepository - ClickHouse repository implementation
 * @property {RedisLogRepository} redisLogRepository - Redis repository implementation
 * @property {RedisLogRepository} logRepository - Default log repository (Redis for ingestion)
 * @property {UserRepository} [userRepository] - User repository (MongoDB dependent)
 * @property {AppRepository} [appRepository] - App repository (MongoDB dependent)
 * @property {IngestLogUseCase} ingestLogUseCase - Log ingestion use case
 * @property {GetLogsByAppIdUseCase} getLogsByAppIdUseCase - Log retrieval use case
 * @property {RegisterUserUseCase} [registerUserUseCase] - User registration use case
 * @property {LoginUserUseCase} [loginUserUseCase] - User login use case
 * @property {CreateAppUseCase} [createAppUseCase] - App creation use case
 * @property {ListUserAppsUseCase} [listUserAppsUseCase] - App listing use case
 * @property {VerifyAppAccessUseCase} [verifyAppAccessUseCase] - App access verification use case
 * @property {OptimizedIngestService} optimizedIngestService - Optimized ingest service with pooling and coalescing
 * @property {IngestLogController} ingestLogController - Log ingestion HTTP controller
 * @property {HealthCheckController} healthCheckController - Health check HTTP controller
 * @property {GetLogsByAppIdController} getLogsByAppIdController - Log retrieval HTTP controller
 * @property {StatsController} statsController - Statistics HTTP controller
 * @property {RegisterController} [registerController] - User registration HTTP controller
 * @property {LoginController} [loginController] - User login HTTP controller
 * @property {MeController} [meController] - User profile HTTP controller
 * @property {CreateAppController} [createAppController] - App creation HTTP controller
 * @property {ListAppsController} [listAppsController] - App listing HTTP controller
 * @property {GetAppController} [getAppController] - App retrieval HTTP controller
 * @property {IngestLogsHandler} [ingestLogsHandler] - Log ingestion gRPC handler
 * @property {HealthCheckHandler} [healthCheckHandler] - Health check gRPC handler
 * @property {GetLogsByAppIdHandler} [getLogsByAppIdHandler] - Log retrieval gRPC handler
 */

/**
 * Dependency Injection Container - Centralized dependency management for the logging platform
 *
 * This container manages the lifecycle of all application services, repositories, and adapters
 * with proper initialization phases and cleanup ordering.
 *
 * Initialization phases (in order):
 * 1. Infrastructure: Database clients, buffer pools
 * 2. Repositories: Data access layer
 * 3. Workers: Background services like validation workers
 * 4. Core Services: Use cases, domain services
 * 5. Adapters: HTTP controllers, gRPC handlers
 */
class DIContainer {
  constructor() {
    this.instances = {};
  }

  async initialize() {
    console.log('[DIContainer] Initializing dependency container...');

    // Phase 1: Infrastructure (databases, pools)
    await this._initializeInfrastructure();

    // Phase 2: Repositories (Data access)
    await this._initializeRepositories();

    // Phase 3: Workers (background services)
    await this._initializeWorkers();

    // Phase 4: Core Services (use cases, domain services)
    await this._initializeCoreServices();

    // Phase 5: Adapters (controllers, handlers)
    await this._initializeAdapters();

    console.log('[DIContainer] All dependencies initialized successfully');
  }

  async _initializeInfrastructure() {
    console.log('[DIContainer] Phase 1: Initializing infrastructure...');

    this.instances.clickhouseClient = createClickHouseClient();

    // Initialize Redis client for high-throughput log ingestion
    this.instances.redisClient = getRedisClient();

    this.instances.bufferPool = new BufferPool({
      sizes: [1024, 4096, 16384, 65536],
      poolSize: parseInt(process.env.BUFFER_POOL_SIZE) || 100
    });

    console.log('[DIContainer] Infrastructure initialized');
  }

  async _initializeRepositories() {
    console.log('[DIContainer] Phase 2: Initializing repositories...');

    this.instances.clickhouseRepository = new ClickHouseRepository(
      this.instances.clickhouseClient
    );

    this.instances.redisLogRepository = new RedisLogRepository(this.instances.redisClient, {
      queueKey: process.env.REDIS_LOG_QUEUE_KEY,
      maxBatchSize: parseInt(process.env.REDIS_BATCH_SIZE || '1000', 10)
    });

    // Default log repository now uses Redis for high-throughput ingestion
    this.instances.logRepository = this.instances.redisLogRepository;

    console.log('[DIContainer] Repositories initialized');
  }

  async _initializeWorkers() {
    console.log('[DIContainer] Phase 3: Initializing workers...');

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

    // Initialize multiple Log Processor Workers for better parallelism
    // Each worker consumes from Redis and saves to ClickHouse
    const workerCount = parseInt(process.env.LOG_PROCESSOR_WORKER_COUNT) || 3; // 3 workers by default
    this.instances.logProcessorWorkers = [];

    for (let i = 0; i < workerCount; i++) {
      const worker = new LogProcessorWorker(
        this.instances.redisClient,
        this.instances.clickhouseRepository,
        {
          queueKey: process.env.REDIS_LOG_QUEUE_KEY || 'logs:ingestion:queue',
          batchSize: parseInt(process.env.WORKER_REDIS_BATCH_SIZE) || 2000,  // Redis LPOP batch size
          pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL) || 5    // Faster polling
        }
      );

      // Start worker with a small delay to avoid thundering herd
      setTimeout(() => worker.start(), i * 100);
      this.instances.logProcessorWorkers.push(worker);
    }

    // Keep backward compatibility
    this.instances.logProcessorWorker = this.instances.logProcessorWorkers[0];

    console.log('[DIContainer] Workers initialized');
  }

  async _initializeCoreServices() {
    console.log('[DIContainer] Phase 4: Initializing core services...');

    // Use Cases
    // IngestLogUseCase now uses Redis for fast "fire-and-forget"
    this.instances.ingestLogUseCase = new IngestLogUseCase(
      this.instances.redisLogRepository
    );

    // GetLogsByAppIdUseCase still reads from ClickHouse
    this.instances.getLogsByAppIdUseCase = new GetLogsByAppIdUseCase(
      this.instances.clickhouseRepository
    );

    this.instances.optimizedIngestService = new OptimizedIngestService(
      this.instances.ingestLogUseCase,
      {
        poolInitialSize: parseInt(process.env.OBJECT_POOL_INITIAL_SIZE) || 1000,
        poolMaxSize: parseInt(process.env.OBJECT_POOL_MAX_SIZE) || 10000,
        usePooling: process.env.USE_OBJECT_POOLING !== 'false',
        coalescerMaxWaitTime: parseInt(process.env.COALESCER_MAX_WAIT_TIME) || 10,
        coalescerMaxBatchSize: parseInt(process.env.COALESCER_MAX_BATCH_SIZE) || 100,
        useCoalescing: process.env.USE_REQUEST_COALESCING !== 'false'
      }
    );

    console.log('[DIContainer] Core services initialized');
  }

  async _initializeAdapters() {
    console.log('[DIContainer] Phase 5: Initializing adapters...');

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

    this.instances.statsController = new StatsController(
      this.instances.logRepository,
      this.instances.optimizedIngestService,
      this.instances.validationService,
      this.instances.bufferPool
    );

    console.log('[DIContainer] Adapters initialized');
  }

  get(name) {
    if (!this.instances[name]) {
      throw new Error(`Dependency not found: ${name}`);
    }
    return this.instances[name];
  }

  getControllers() {
    const controllers = {
      ingestLogController: this.instances.ingestLogController,
      healthCheckController: this.instances.healthCheckController,
      getLogsByAppIdController: this.instances.getLogsByAppIdController,
      statsController: this.instances.statsController
    };
    return controllers;
  }

  getHandlers() {
    const handlers = {
      healthCheckHandler: this.instances.healthCheckHandler
    };
    return handlers;
  }

  async cleanup() {
    console.log('[DIContainer] Starting graceful shutdown...');

    try {
      // Phase 1: Cleanup adapters
      await this._cleanupAdapters();

      // Phase 2: Cleanup core services
      await this._cleanupCoreServices();

      // Phase 3: Cleanup workers
      await this._cleanupWorkers();

      // Phase 4: Cleanup repositories (flush buffers)
      await this._cleanupRepositories();

      // Phase 5: Cleanup infrastructure
      await this._cleanupInfrastructure();

      console.log('[DIContainer] Graceful shutdown completed');
    } catch (error) {
      console.error('[DIContainer] Error during shutdown:', error);
      throw error;
    }
  }

  async _cleanupAdapters() {
    console.log('[DIContainer] Cleaning up adapters...');
  }

  async _cleanupCoreServices() {
    console.log('[DIContainer] Cleaning up core services...');
    if (this.instances.optimizedIngestService) {
      await this.instances.optimizedIngestService.flush();
    }
  }

  async _cleanupWorkers() {
    console.log('[DIContainer] Cleaning up workers...');
    if (this.instances.validationService) {
      await this.instances.validationService.shutdown();
    }
    if (this.instances.logProcessorWorkers) {
      await Promise.all(
        this.instances.logProcessorWorkers.map(worker => worker.stop())
      );
    } else if (this.instances.logProcessorWorker) {
      // Backward compatibility
      await this.instances.logProcessorWorker.stop();
    }
  }

  async _cleanupRepositories() {
    console.log('[DIContainer] Cleaning up repositories...');
    if (this.instances.clickhouseRepository) {
      await this.instances.clickhouseRepository.shutdown();
    }
  }

  async _cleanupInfrastructure() {
    console.log('[DIContainer] Cleaning up infrastructure...');
    if (this.instances.clickhouseClient) {
      await this.instances.clickhouseClient.close();
    }
    if (this.instances.mongoDBConnection) {
      await this.instances.mongoDBConnection.disconnect();
    }
    await closeRedisConnection();
  }
}

module.exports = DIContainer;
