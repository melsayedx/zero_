/**
 * Dependency Injection Container
 * Simple DI implementation - wires everything together
 */

const IngestLogUseCase = require('../core/use-cases/ingest-log.use-case');
const ClickHouseRepository = require('../adapters/repositories/clickhouse.repository');
const MongoDBRepository = require('../adapters/repositories/mongodb.repository');
const { LogController } = require('../adapters/http/controllers');

class DIContainer {
  constructor() {
    this.services = new Map();
  }

  /**
   * Register database clients
   */
  registerDatabases(clickhouseClient, mongoDb) {
    this.services.set('clickhouseClient', clickhouseClient);
    this.services.set('mongoDb', mongoDb);
  }

  /**
   * Build and wire all dependencies
   */
  build() {
    // Repositories (Adapters)
    const clickhouseClient = this.services.get('clickhouseClient');
    const mongoDb = this.services.get('mongoDb');
    
    const logRepository = new ClickHouseRepository(clickhouseClient);
    const dashboardRepository = new MongoDBRepository(mongoDb);

    // Use Cases (Core)
    const ingestLogUseCase = new IngestLogUseCase(logRepository);

    // Controllers (Adapters)
    const logController = new LogController(ingestLogUseCase);

    // Store for easy access
    this.services.set('logRepository', logRepository);
    this.services.set('dashboardRepository', dashboardRepository);
    this.services.set('ingestLogUseCase', ingestLogUseCase);
    this.services.set('logController', logController);

    return this;
  }

  /**
   * Get service by name
   */
  get(serviceName) {
    if (!this.services.has(serviceName)) {
      throw new Error(`Service not found: ${serviceName}`);
    }
    return this.services.get(serviceName);
  }
}

module.exports = DIContainer;

