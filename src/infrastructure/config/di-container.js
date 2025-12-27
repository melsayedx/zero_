const { createClickHouseClient } = require('../database/clickhouse');
const ClickHouseRepository = require('../../interfaces/persistence/clickhouse.repository');
const RedisLogRepository = require('../../interfaces/persistence/redis-log.repository');
const IngestLogUseCase = require('../../application/use-cases/logs/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../../application/use-cases/logs/get-logs-by-app-id.use-case');
const { IngestLogController, HealthCheckController, GetLogsByAppIdController } = require('../../interfaces/http/controllers');
const { StatsController } = require('../../interfaces/http/controllers');
const { IngestLogsHandler, HealthCheckHandler, GetLogsByAppIdHandler } = require('../../interfaces/grpc/handlers');
const WorkerValidationStrategy = require('../strategies/worker-validation.strategy');
const LogProcessorThreadManager = require('../workers/log-processor-thread-manager');
const LogIngestionService = require('../../application/services/log-ingest.service');
const RequestManager = require('../request-processing/request-manager');

const RedisRetryStrategy = require('../retry-strategies/redis-retry-strategy');
const RedisQueryCache = require('../cache/redis-query.cache');
const { getRedisClient, closeRedisConnection, redisConfig } = require('../database/redis');
const RedisIdempotencyStore = require('../idempotency/redis-idempotency.store');
const { LoggerFactory } = require('../logging');


/**
 * @typedef {Object} DIContainerInstances
 * @property {import('../database/clickhouse').ClickHouseClient} clickhouseClient - ClickHouse database client
 * @property {WorkerValidationStrategy} validationService - Validation service with worker threads
 * @property {LogProcessorWorker} logProcessorWorker - Worker to move logs from Redis to ClickHouse
 * @property {ClickHouseRepository} clickhouseRepository - ClickHouse repository implementation
 * @property {RedisLogRepository} redisLogRepository - Redis repository implementation
 * @property {RedisLogRepository} logRepository - Default log repository (Redis for ingestion)
 * @property {IngestLogUseCase} ingestLogUseCase - Log ingestion use case
 * @property {GetLogsByAppIdUseCase} getLogsByAppIdUseCase - Log retrieval use case
 * @property {LogIngestionService} logIngestionService - Log ingestion service with coalescing and batching
 * @property {IngestLogController} ingestLogController - Log ingestion HTTP controller
 * @property {HealthCheckController} healthCheckController - Health check HTTP controller
 * @property {GetLogsByAppIdController} getLogsByAppIdController - Log retrieval HTTP controller
 * @property {StatsController} statsController - Statistics HTTP controller
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
    // Initialize logger early - it's used throughout initialization
    // Logging is controlled via LOG_MODE env var (disabled/null/silent = off, structured = on)
    this.logger = LoggerFactory.getInstance();
  }

  async initialize() {
    this.logger.info('Initializing dependency container...');

    // Phase 1: Infrastructure (databases, pools, logger)
    await this._initializeInfrastructure();

    // Phase 2: Persistence (Data access - interfaces layer)
    await this._initializeRepositories();

    // Phase 3: Workers (background services)
    await this._initializeWorkers();

    // Phase 4: Application Services (use cases, domain services)
    await this._initializeCoreServices();

    // Phase 5: Interface Adapters (controllers, handlers)
    await this._initializeAdapters();

    this.logger.info('All dependencies initialized successfully');
  }

  async _initializeInfrastructure() {
    this.logger.info('Phase 1: Initializing infrastructure...');

    // Store logger in instances for injection into other components
    this.instances.logger = this.logger;

    this.instances.clickhouseClient = createClickHouseClient();

    // Initialize Redis client for high-throughput log ingestion
    this.instances.redisClient = getRedisClient();

    this.logger.info('Infrastructure initialized');
  }

  async _initializeRepositories() {
    this.logger.info('Phase 2: Initializing repositories...');

    // Create retry strategy for the repository
    this.instances.clickhouseRetryStrategy = new RedisRetryStrategy(
      this.instances.redisClient,
      {
        queueName: 'clickhouse:dead-letter',
        maxRetries: 3,
        retryDelay: 1000,
        enableLogging: process.env.ENABLE_RETRY_LOGGING === 'true',
        logger: this.instances.logger.child({ component: 'RedisRetryStrategy' })
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
        queryCache: this.instances.clickhouseQueryCache,
        logger: this.instances.logger.child({ component: 'ClickHouseRepository' })
      }
    );

    // Note: BatchBuffer is NOT injected here - it's owned by LogProcessorWorker
    // for crash-proof Redis Stream processing with XACK after ClickHouse insert

    this.instances.redisLogRepository = new RedisLogRepository(this.instances.redisClient, {
      queueKey: process.env.REDIS_LOG_STREAM_KEY || 'logs:stream',
      maxBatchSize: parseInt(process.env.REDIS_BATCH_SIZE || '1000', 10),
      logger: this.instances.logger.child({ component: 'RedisLogRepository' })
    });

    // Default log repository now uses Redis for high-throughput ingestion
    this.instances.logRepository = this.instances.redisLogRepository;

    // Idempotency store for duplicate request prevention
    this.instances.idempotencyStore = new RedisIdempotencyStore(
      this.instances.redisClient,
      {
        ttl: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS) || 86400, // 24 hours
        prefix: process.env.IDEMPOTENCY_KEY_PREFIX || 'idempotency',
        enableLogging: process.env.ENABLE_IDEMPOTENCY_LOGGING === 'true',
        logger: this.instances.logger.child({ component: 'RedisIdempotencyStore' })
      }
    );

    this.logger.info('Repositories initialized');
  }

  async _initializeWorkers() {
    this.logger.info('Phase 3: Initializing workers...');

    this.instances.validationService = new WorkerValidationStrategy({
      logger: this.instances.logger.child({ component: 'WorkerValidationStrategy' }),
      smallBatchThreshold: parseInt(process.env.VALIDATION_SMALL_BATCH_THRESHOLD) || 50,
      mediumBatchThreshold: parseInt(process.env.VALIDATION_MEDIUM_BATCH_THRESHOLD) || 100,
      enableWorkerValidation: process.env.ENABLE_WORKER_VALIDATION === 'true',
      forceWorkerValidation: process.env.FORCE_WORKER_VALIDATION === 'true',
      workerPool: {
        minWorkers: parseInt(process.env.WORKER_POOL_MIN_WORKERS) || 2,
        maxWorkers: parseInt(process.env.WORKER_POOL_MAX_WORKERS) || Math.min(require('os').cpus().length, 8) / 2,
        taskTimeout: parseInt(process.env.WORKER_TASK_TIMEOUT) || 30000
      }
    });

    // Initialize Log Processor Thread Manager
    // Workers run in separate threads for true CPU isolation from main HTTP thread
    this.instances.logProcessorThreadManager = new LogProcessorThreadManager({
      workerCount: parseInt(process.env.LOG_PROCESSOR_WORKER_COUNT) || 3,
      redisConfig: redisConfig,
      streamKey: process.env.REDIS_LOG_STREAM_KEY || 'logs:stream',
      groupName: process.env.REDIS_CONSUMER_GROUP || 'log-processors',
      batchSize: parseInt(process.env.WORKER_REDIS_BATCH_SIZE) || 2000,
      maxBatchSize: parseInt(process.env.WORKER_BUFFER_BATCH_SIZE) || 100000,
      maxWaitTime: parseInt(process.env.WORKER_BUFFER_WAIT_TIME) || 1000,
      pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL) || 5,
      claimMinIdleMs: parseInt(process.env.WORKER_CLAIM_MIN_IDLE) || 30000,
      retryQueueLimit: parseInt(process.env.WORKER_RETRY_QUEUE_LIMIT) || 10000,
      clickhouseTable: process.env.CLICKHOUSE_TABLE || 'logs',
      logger: this.logger.child({ component: 'LogProcessorThreadManager' })
    });

    // Start all worker threads
    await this.instances.logProcessorThreadManager.start();

    this.logger.info('Worker threads initialized');
  }

  async _initializeCoreServices() {
    this.logger.info('Phase 4: Initializing application services...');

    // Use Cases
    // WorkerValidationStrategy auto-selects strategy based on batch size:
    // - batch <= 50: SyncValidationStrategy (main thread)
    // - batch > 50: Worker threads
    // Can be switched at runtime via ingestLogUseCase.setValidationStrategy()

    // IngestLogUseCase uses WorkerValidationStrategy for auto-selection
    this.instances.ingestLogUseCase = new IngestLogUseCase(
      this.instances.redisLogRepository,
      this.instances.validationService,
      this.instances.logger.child({ component: 'IngestLogUseCase' })
    );

    // GetLogsByAppIdUseCase still reads from ClickHouse
    this.instances.getLogsByAppIdUseCase = new GetLogsByAppIdUseCase(
      this.instances.clickhouseRepository
    );

    // 1. Initialize LogIngestionService (Pure Application Service) - Dependencies: UseCases
    this.instances.logIngestionService = new LogIngestionService(
      this.instances.ingestLogUseCase,
      {
        logger: this.instances.logger.child({ component: 'LogIngestionService' })
      }
    );

    // 2. Initialize RequestManager (Infrastructure Layer) - Dependencies: Application Service
    // This wraps the service to provide coalescing/buffering
    this.instances.requestManager = new RequestManager(
      (dataArray) => this.instances.logIngestionService.processBatch(dataArray),
      {
        maxWaitTime: parseInt(process.env.COALESCER_MAX_WAIT_TIME) || 50,
        maxBatchSize: parseInt(process.env.COALESCER_MAX_BATCH_SIZE) || 5000,
        enabled: process.env.USE_REQUEST_COALESCING === 'true',
        logger: this.instances.logger.child({ component: 'RequestManager' })
      }
    );



    this.logger.info('Application services initialized');


    this.logger.info('Application services initialized');
  }

  async _initializeAdapters() {
    this.logger.info('Phase 5: Initializing interface adapters...');

    this.instances.ingestLogController = new IngestLogController(
      this.instances.requestManager
    );


    this.instances.healthCheckController = new HealthCheckController(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdController = new GetLogsByAppIdController(
      this.instances.getLogsByAppIdUseCase
    );

    this.instances.statsController = new StatsController(
      this.instances.logRepository,
      this.instances.logIngestionService, // Service metrics
      this.instances.validationService,
      this.instances.requestManager // Buffer/Coalescer metrics
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

    this.logger.info('Interface adapters initialized');
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
    this.logger.info('Starting graceful shutdown...');

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

      this.logger.info('Graceful shutdown completed');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  async _cleanupAdapters() {
    this.logger.debug('Cleaning up interface adapters...');
  }

  async _cleanupCoreServices() {
    this.logger.debug('Cleaning up application services...');

    if (this.instances.requestManager) {
      await this.instances.requestManager.shutdown();
    }
  }

  async _cleanupWorkers() {
    this.logger.debug('Cleaning up workers...');
    if (this.instances.validationService) {
      await this.instances.validationService.shutdown();
    }
    if (this.instances.logProcessorThreadManager) {
      await this.instances.logProcessorThreadManager.shutdown();
    }
  }

  async _cleanupRepositories() {
    this.logger.debug('Cleaning up repositories...');
    // Note: ClickHouseRepository is stateless - no buffer to flush
    // BatchBuffer cleanup happens in _cleanupWorkers via LogProcessorWorker.stop()
    if (this.instances.clickhouseRetryStrategy) {
      await this.instances.clickhouseRetryStrategy.shutdown();
    }
  }

  async _cleanupInfrastructure() {
    this.logger.debug('Cleaning up infrastructure...');
    if (this.instances.clickhouseClient) {
      await this.instances.clickhouseClient.close();
    }
    await closeRedisConnection();
  }
}

module.exports = DIContainer;
