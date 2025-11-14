const { createClickHouseClient } = require('./database');
const mongoDBConnection = require('./mongodb');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const UserRepository = require('../adapters/repositories/user.repository');
const AppRepository = require('../adapters/repositories/app.repository');
const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const GetLogsByAppIdUseCase = require('../core/use-cases/get-logs-by-app-id.use-case');
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
const OptimizedIngestService = require('../core/services/optimized-ingest.service');
const { BufferPool } = require('../core/utils/buffer-utils');

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
  async initialize() {
    // MongoDB Connection
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongodb:27017/logs_platform';
    await mongoDBConnection.connect(mongoUri);
    this.instances.mongoDBConnection = mongoDBConnection;

    // Database Clients
    this.instances.clickhouseClient = createClickHouseClient();

    // Buffer Pool for zero-copy operations
    this.instances.bufferPool = new BufferPool({
      sizes: [1024, 4096, 16384, 65536], // 1KB, 4KB, 16KB, 64KB
      poolSize: parseInt(process.env.BUFFER_POOL_SIZE) || 100
    });

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

    this.instances.userRepository = new UserRepository();
    this.instances.appRepository = new AppRepository();

    // Use Cases - Logging
    this.instances.ingestLogUseCase = new IngestLogUseCase(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdUseCase = new GetLogsByAppIdUseCase(
      this.instances.logRepository
    );

<<<<<<< HEAD
    // Optimized Ingest Service (with pooling and coalescing)
    this.instances.optimizedIngestService = new OptimizedIngestService(
      this.instances.ingestLogUseCase,
      {
        // Object pooling configuration
        poolInitialSize: parseInt(process.env.OBJECT_POOL_INITIAL_SIZE) || 1000,
        poolMaxSize: parseInt(process.env.OBJECT_POOL_MAX_SIZE) || 10000,
        usePooling: process.env.USE_OBJECT_POOLING !== 'false',
        
        // Request coalescing configuration
        coalescerMaxWaitTime: parseInt(process.env.COALESCER_MAX_WAIT_TIME) || 10, // 10ms
        coalescerMaxBatchSize: parseInt(process.env.COALESCER_MAX_BATCH_SIZE) || 100,
        useCoalescing: process.env.USE_REQUEST_COALESCING !== 'false'
      }
    );

    // HTTP Controllers
=======
    // Use Cases - Authentication
    this.instances.registerUserUseCase = new RegisterUserUseCase(
      this.instances.userRepository
    );

    this.instances.loginUserUseCase = new LoginUserUseCase(
      this.instances.userRepository
    );

    // Use Cases - Apps
    this.instances.createAppUseCase = new CreateAppUseCase(
      this.instances.appRepository
    );

    this.instances.listUserAppsUseCase = new ListUserAppsUseCase(
      this.instances.appRepository
    );

    this.instances.verifyAppAccessUseCase = new VerifyAppAccessUseCase(
      this.instances.appRepository
    );

    // HTTP Controllers - Logging
>>>>>>> mongodb
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

    // HTTP Controllers - Authentication
    this.instances.registerController = new RegisterController(
      this.instances.registerUserUseCase
    );

    this.instances.loginController = new LoginController(
      this.instances.loginUserUseCase
    );

    this.instances.meController = new MeController();

    // HTTP Controllers - Apps
    this.instances.createAppController = new CreateAppController(
      this.instances.createAppUseCase
    );

    this.instances.listAppsController = new ListAppsController(
      this.instances.listUserAppsUseCase
    );

    this.instances.getAppController = new GetAppController(
      this.instances.verifyAppAccessUseCase
    );

    // gRPC Handlers
    this.instances.ingestLogsHandler = new IngestLogsHandler(
      this.instances.ingestLogUseCase,
      this.instances.verifyAppAccessUseCase
    );

    this.instances.healthCheckHandler = new HealthCheckHandler(
      this.instances.logRepository
    );

    this.instances.getLogsByAppIdHandler = new GetLogsByAppIdHandler(
      this.instances.getLogsByAppIdUseCase,
      this.instances.verifyAppAccessUseCase
    );

    this.instances.statsController = new StatsController(
      this.instances.logRepository,
      this.instances.optimizedIngestService,
      this.instances.validationService,
      this.instances.bufferPool
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
      // Log controllers
      ingestLogController: this.get('ingestLogController'),
      healthCheckController: this.get('healthCheckController'),
      getLogsByAppIdController: this.get('getLogsByAppIdController'),
      statsController: this.get('statsController'),
      
      // Auth controllers
      registerController: this.get('registerController'),
      loginController: this.get('loginController'),
      meController: this.get('meController'),
      
      // App controllers
      createAppController: this.get('createAppController'),
      listAppsController: this.get('listAppsController'),
      getAppController: this.get('getAppController'),
      
      // Use cases (for middleware/controllers that need them)
      verifyAppAccessUseCase: this.get('verifyAppAccessUseCase')
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
    // Flush any pending coalesced requests
    if (this.instances.optimizedIngestService) {
      console.log('[DIContainer] Flushing coalesced requests...');
      await this.instances.optimizedIngestService.flush();
    }
    
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

    // Close MongoDB connection
    if (this.instances.mongoDBConnection) {
      console.log('[DIContainer] Closing MongoDB connection...');
      await this.instances.mongoDBConnection.disconnect();
    }
  }
}

module.exports = DIContainer;

