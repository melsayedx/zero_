/**
 * Schema Registry Service
 * Manages schema registration and validation
 */

const mongodbService = require('../storage/mongodb.service');
const schemaDetector = require('../ingestion/schema-detector.service');
const logger = require('../../utils/logger');

class SchemaRegistryService {
  constructor() {
    this.schemaCache = new Map();
  }

  /**
   * Register new schema
   * @param {Object} schemaData - Schema definition
   * @returns {Promise<Object>} Registered schema
   */
  async registerSchema(schemaData) {
    try {
      const schema = await mongodbService.registerSchema(schemaData);
      
      // Cache schema
      this.schemaCache.set(schema.name, schema);
      
      logger.info('Schema registered', { 
        name: schema.name,
        version: schema.version 
      });
      
      return schema;
    } catch (error) {
      logger.error('Schema registration error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get schema by name
   * @param {string} name - Schema name
   * @returns {Promise<Object>} Schema
   */
  async getSchema(name) {
    try {
      // Check cache first
      if (this.schemaCache.has(name)) {
        return this.schemaCache.get(name);
      }

      // Fetch from database
      const schema = await mongodbService.getSchema(name);
      
      // Update cache
      this.schemaCache.set(name, schema);
      
      return schema;
    } catch (error) {
      logger.error('Schema retrieval error', { name, error: error.message });
      throw error;
    }
  }

  /**
   * Get schema for service
   * @param {string} serviceName - Service name
   * @returns {Promise<Object|null>} Schema or null
   */
  async getSchemaForService(serviceName) {
    try {
      return await mongodbService.getSchemaForService(serviceName);
    } catch (error) {
      logger.debug('No schema found for service', { serviceName });
      return null;
    }
  }

  /**
   * List all schemas
   * @returns {Promise<Array>} Schemas
   */
  async listSchemas() {
    try {
      return await mongodbService.listSchemas();
    } catch (error) {
      logger.error('Schema list error', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate log against schema
   * @param {Object} log - Log entry
   * @param {string} schemaName - Schema name
   * @returns {Promise<Object>} Validation result
   */
  async validateLog(log, schemaName) {
    try {
      const schema = await this.getSchema(schemaName);
      return schema.validateLog(log);
    } catch (error) {
      logger.error('Log validation error', { 
        schemaName,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Auto-register schema from log samples
   * @param {Array} logs - Sample logs
   * @param {string} serviceName - Service name
   * @param {string} owner - Owner user ID
   * @returns {Promise<Object>} Registered schema
   */
  async autoRegisterSchema(logs, serviceName, owner) {
    try {
      // Detect schema
      const detected = schemaDetector.detectSchema(logs, serviceName);
      
      // Create schema data
      const schemaData = {
        name: `${serviceName}_auto_schema`,
        version: '1.0.0',
        description: `Auto-generated schema for ${serviceName}`,
        owner,
        fields: detected.fieldDefinitions,
        services: [serviceName],
        baseSchema: 'default',
        validation: {
          strict: false,
          allowAdditionalFields: true
        }
      };

      // Register schema
      return await this.registerSchema(schemaData);
    } catch (error) {
      logger.error('Auto schema registration error', { 
        serviceName,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update schema statistics
   * @param {string} schemaName - Schema name
   * @param {number} logsCount - Number of logs processed
   * @param {number} errorsCount - Number of validation errors
   * @returns {Promise<void>}
   */
  async updateStats(schemaName, logsCount, errorsCount = 0) {
    try {
      const schema = await this.getSchema(schemaName);
      await schema.updateStats(logsCount, errorsCount);
      
      // Update cache
      this.schemaCache.set(schemaName, schema);
    } catch (error) {
      logger.error('Schema stats update error', { 
        schemaName,
        error: error.message 
      });
    }
  }

  /**
   * Compare detected schema with registered schema
   * @param {Array} logs - Sample logs
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Comparison result
   */
  async compareWithRegistered(logs, serviceName) {
    try {
      // Detect schema from logs
      const detected = schemaDetector.detectSchema(logs, serviceName);
      
      // Get registered schema
      const registered = await this.getSchemaForService(serviceName);
      
      if (!registered) {
        return {
          hasRegistered: false,
          message: 'No registered schema found'
        };
      }

      // Compare schemas
      const comparison = schemaDetector.compareSchemas(detected, registered);
      
      return {
        hasRegistered: true,
        comparison,
        detected,
        registered
      };
    } catch (error) {
      logger.error('Schema comparison error', { 
        serviceName,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Clear schema cache
   */
  clearCache() {
    this.schemaCache.clear();
    logger.info('Schema cache cleared');
  }

  /**
   * Invalidate specific schema in cache
   * @param {string} name - Schema name
   */
  invalidateCache(name) {
    this.schemaCache.delete(name);
    logger.info('Schema cache invalidated', { name });
  }
}

module.exports = new SchemaRegistryService();

