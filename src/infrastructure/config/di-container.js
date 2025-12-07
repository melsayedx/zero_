const { createClickHouseClient } = require('../database/clickhouse');
const mongoDBConnection = require('../database/mongodb');
const ClickHouseRepository = require('../../interfaces/persistence/clickhouse.repository');
const RedisLogRepository = require('../../interfaces/persistence/redis-log.repository');
const UserRepository = require('../../interfaces/persistence/user.repository');
const AppRepository = require('../../interfaces/persistence/app.repository');
const IngestLogUseCase = require('../../application/use-cases/logs/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../../application/use-cases/logs/get-logs-by-app-id.use-case');
const RegisterUserUseCase = require('../../application/use-cases/auth/register-user.use-case');
const LoginUserUseCase = require('../../application/use-cases/auth/login-user.use-case');
const CreateAppUseCase = require('../../application/use-cases/apps/create-app.use-case');
const ListUserAppsUseCase = require('../../application/use-cases/apps/list-user-apps.use-case');
const VerifyAppAccessUseCase = require('../../application/use-cases/apps/verify-app-access.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController } = require('../../interfaces/http/controllers');
const { StatsController } = require('../../interfaces/http/controllers');
const { RegisterController, LoginController, MeController } = require('../../interfaces/http/auth.controllers');
const { CreateAppController, ListAppsController, GetAppController } = require('../../interfaces/http/app.controllers');
const { IngestLogsHandler, HealthCheckHandler, GetLogsByAppIdHandler } = require('../../interfaces/grpc/handlers');
const WorkerValidationStrategy = require('../strategies/worker-validation.strategy');
const LogProcessorWorker = require('../workers/log-processor.worker');
const LogIngestionService = require('../../application/services/log-ingest.service');
const RequestCoalescer = require('../request-coalescing/request-coalescer');

const BatchBuffer = require('../buffers/batch-buffer');
const RedisRetryStrategy = require('../retry-strategies/redis-retry-strategy');
const RedisQueryCache = require('../cache/redis-query.cache');
const { getRedisClient, closeRedisConnection } = require('../database/redis');
const RedisIdempotencyStore = require('../idempotency/redis-idempotency.store');

/**
 * @typedef {Object} DIContainerInstances
 * @property {import('../database/clickhouse').ClickHouseClient} clickhouseClient - ClickHouse database client
 * @property {WorkerValidationStrategy} validationService - Validation service with worker threads
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
 * @property {LogIngestionService} logIngestionService - Log ingestion service with coalescing and batching
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
 * This container manages the lifecycle of all application services, repositories, and interface adapters
 * with proper initialization phases and cleanup ordering following Onion Architecture.
 *
 * Initialization phases (in order):
 * 1. Infrastructure: Database clients, buffer pools
 * 2. Persistence: Repository implementations (interfaces layer)
 * 3. Workers: Background services like validation workers
 * 4. Application Services: Use cases, domain services
 * 5. Interface Adapters: HTTP controllers, gRPC handlers
 */
class DIContainer {
  constructor() {
    this.instances = {};
  }

  async initialize() {
    console.log('[DIContainer] Initializing dependency container...');

    // Phase 1: Infrastructure (databases, pools)
    await this._initializeInfrastructure();

    // Phase 2: Persistence (Data access - interfaces layer)
    await this._initializeRepositories();

    // Phase 3: Workers (background services)
    await this._initializeWorkers();

    // Phase 4: Application Services (use cases, domain services)
    await this._initializeCoreServices();

    // Phase 5: Interface Adapters (controllers, handlers)
    await this._initializeAdapters();

    console.log('[DIContainer] All dependencies initialized successfully');
  }

  async _initializeInfrastructure() {
    console.log('[DIContainer] Phase 1: Initializing infrastructure...');

    this.instances.clickhouseClient = createClickHouseClient();

    // Initialize Redis client for high-throughput log ingestion
    this.instances.redisClient = getRedisClient();

    console.log('[DIContainer] Infrastructure initialized');
  }

  async _initializeRepositories() {
    console.log('[DIContainer] Phase 2: Initializing repositories...');

    // Create retry strategy for the repository
    this.instances.clickhouseRetryStrategy = new RedisRetryStrategy(
      this.instances.redisClient,
      {
        queueName: 'clickhouse:dead-letter',
        maxRetries: 3,
        retryDelay: 1000,
        enableLogging: process.env.ENABLE_RETRY_LOGGING !== 'false'
      }
    );

    // Query cache for ClickHouse (uses Redis for distributed deployments)
    this.instances.clickhouseQueryCache = new RedisQueryCache(
      this.instances.redisClient,
      { prefix: 'clickhouse:query', ttl: 3600 }
    );

    this.instances.clickhouseRepository = new ClickHouseRepository(
      this.instances.clickhouseClient,
      {
        tableName: process.env.CLICKHOUSE_TABLE || 'logs',
        queryCache: this.instances.clickhouseQueryCache
      }
    );

    // Note: BatchBuffer is NOT injected here - it's owned by LogProcessorWorker
    // for crash-proof Redis Stream processing with XACK after ClickHouse insert

    this.instances.redisLogRepository = new RedisLogRepository(this.instances.redisClient, {
      queueKey: process.env.REDIS_LOG_QUEUE_KEY,
      maxBatchSize: parseInt(process.env.REDIS_BATCH_SIZE || '1000', 10)
    });

    // Default log repository now uses Redis for high-throughput ingestion
    this.instances.logRepository = this.instances.redisLogRepository;

    // Idempotency store for duplicate request prevention
    this.instances.idempotencyStore = new RedisIdempotencyStore(
      this.instances.redisClient,
      {
        ttl: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS) || 86400, // 24 hours
        prefix: process.env.IDEMPOTENCY_KEY_PREFIX || 'idempotency',
        enableLogging: process.env.ENABLE_IDEMPOTENCY_LOGGING === 'true'
      }
    );

    console.log('[DIContainer] Repositories initialized');
  }

  async _initializeWorkers() {
    console.log('[DIContainer] Phase 3: Initializing workers...');

    this.instances.validationService = new WorkerValidationStrategy({
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
    // Each worker consumes from Redis Stream and saves to ClickHouse (crash-proof)
    const workerCount = parseInt(process.env.LOG_PROCESSOR_WORKER_COUNT) || 3; // 3 workers by default
    this.instances.logProcessorWorkers = [];

    for (let i = 0; i < workerCount; i++) {
      const worker = new LogProcessorWorker(
        this.instances.redisClient,
        this.instances.clickhouseRepository,
        this.instances.clickhouseRetryStrategy,
        {
          streamKey: process.env.REDIS_LOG_STREAM_KEY || 'logs:stream',
          groupName: process.env.REDIS_CONSUMER_GROUP || 'log-processors',
          consumerName: `worker-${process.pid}-${i}`,
          batchSize: parseInt(process.env.WORKER_REDIS_BATCH_SIZE) || 2000,
          maxBatchSize: parseInt(process.env.WORKER_BUFFER_BATCH_SIZE) || 100000,
          maxWaitTime: parseInt(process.env.WORKER_BUFFER_WAIT_TIME) || 1000,
          pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL) || 5,
          enableLogging: process.env.ENABLE_WORKER_LOGGING !== 'false'
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
    console.log('[DIContainer] Phase 4: Initializing application services...');

    // Use Cases
    // WorkerValidationStrategy auto-selects strategy based on batch size:
    // - batch <= 50: SyncValidationStrategy (main thread)
    // - batch > 50: Worker threads
    // Can be switched at runtime via ingestLogUseCase.setValidationStrategy()

    // IngestLogUseCase uses WorkerValidationStrategy for auto-selection
    this.instances.ingestLogUseCase = new IngestLogUseCase(
      this.instances.redisLogRepository,
      this.instances.validationService
    );

    // GetLogsByAppIdUseCase still reads from ClickHouse
    this.instances.getLogsByAppIdUseCase = new GetLogsByAppIdUseCase(
      this.instances.clickhouseRepository
    );

    // Create request coalescer first with placeholder processor
    this.instances.requestCoalescer = new RequestCoalescer(
      () => { /* placeholder - bound after service creation */ },
      {
        maxWaitTime: parseInt(process.env.COALESCER_MAX_WAIT_TIME) || 10,
        maxBatchSize: parseInt(process.env.COALESCER_MAX_BATCH_SIZE) || 100,
        enabled: process.env.USE_REQUEST_COALESCING !== 'false'
      }
    );

    // Create optimized ingest service with injected coalescer
    this.instances.logIngestionService = new LogIngestionService(
      this.instances.ingestLogUseCase,
      this.instances.requestCoalescer,
      {
        useCoalescing: process.env.USE_REQUEST_COALESCING !== 'false',
        minBatchSize: parseInt(process.env.COALESCER_MIN_BATCH_SIZE) || 50
      }
    );

    // Bind the real processor function to the coalescer
    this.instances.requestCoalescer.processor = (dataArray) =>
      this.instances.logIngestionService.processBatch(dataArray);

    console.log('[DIContainer] Application services initialized');
  }

  async _initializeAdapters() {
    console.log('[DIContainer] Phase 5: Initializing interface adapters...');

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
      this.instances.logRepository,
      this.instances.optimizedIngestService,
      this.instances.validationService
    );

    // Initialize gRPC handlers
    this.instances.ingestLogsHandler = new IngestLogsHandler(
      this.instances.ingestLogUseCase,
      null, // verifyAppAccessUseCase - not available without MongoDB
      this.instances.idempotencyStore
    );

    this.instances.healthCheckHandler = new HealthCheckHandler(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdHandler = new GetLogsByAppIdHandler(
      this.instances.getLogsByAppIdUseCase,
      null // verifyAppAccessUseCase - not available without MongoDB
    );

    console.log('[DIContainer] Interface adapters initialized');
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
      statsController: this.instances.statsController,
      idempotencyStore: this.instances.idempotencyStore
    };
    return controllers;
  }

  getHandlers() {
    const handlers = {
      ingestLogsHandler: this.instances.ingestLogsHandler,
      healthCheckHandler: this.instances.healthCheckHandler,
      getLogsByAppIdHandler: this.instances.getLogsByAppIdHandler
    };
    return handlers;
  }

  async cleanup() {
    console.log('[DIContainer] Starting graceful shutdown...');

    try {
      // Phase 1: Cleanup interface adapters
      await this._cleanupAdapters();

      // Phase 2: Cleanup application services
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
    console.log('[DIContainer] Cleaning up interface adapters...');
  }

  async _cleanupCoreServices() {
    console.log('[DIContainer] Cleaning up application services...');
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
    // Note: ClickHouseRepository is stateless - no buffer to flush
    // BatchBuffer cleanup happens in _cleanupWorkers via LogProcessorWorker.stop()
    if (this.instances.clickhouseRetryStrategy) {
      await this.instances.clickhouseRetryStrategy.shutdown();
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
