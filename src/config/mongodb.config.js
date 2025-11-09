/**
 * MongoDB Configuration
 * Handles MongoDB/Mongoose connection initialization and management
 */

const mongoose = require('mongoose');
const dbConfig = require('./database.config');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Initialize MongoDB connection with retry logic
 * @returns {Promise<void>}
 */
const initMongoDB = async () => {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  try {
    const config = dbConfig.mongodb;
    
    // Configure mongoose
    mongoose.set('strictQuery', false);
    
    // Connection event handlers
    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connected successfully', { uri: config.uri });
    });

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error', { error: error.message });
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await closeMongoDB();
      process.exit(0);
    });

    await mongoose.connect(config.uri, config.options);
    
  } catch (error) {
    logger.error('Failed to initialize MongoDB', { error: error.message });
    throw error;
  }
};

/**
 * Close MongoDB connection
 * @returns {Promise<void>}
 */
const closeMongoDB = async () => {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed');
  }
};

/**
 * Get MongoDB connection status
 * @returns {boolean} Connection status
 */
const isMongoDBConnected = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

/**
 * Health check for MongoDB
 * @returns {Promise<boolean>} Connection status
 */
const healthCheck = async () => {
  try {
    if (!isConnected) {
      return false;
    }
    
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    logger.error('MongoDB health check failed', { error: error.message });
    return false;
  }
};

/**
 * Get MongoDB connection instance
 * @returns {Object} Mongoose connection
 */
const getConnection = () => {
  if (!isConnected) {
    throw new Error('MongoDB not connected. Call initMongoDB() first.');
  }
  return mongoose.connection;
};

module.exports = {
  initMongoDB,
  closeMongoDB,
  isMongoDBConnected,
  healthCheck,
  getConnection
};

