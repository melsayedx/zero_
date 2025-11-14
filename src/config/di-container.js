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
    this.instances.ingestLogController = new IngestLogController(
      this.instances.ingestLogUseCase
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

    // Close MongoDB connection
    if (this.instances.mongoDBConnection) {
      console.log('[DIContainer] Closing MongoDB connection...');
      await this.instances.mongoDBConnection.disconnect();
    }
  }
}

module.exports = DIContainer;

