const mongoose = require('mongoose');
const { LoggerFactory } = require('../logging');

/**
 * MongoDB Connection Manager
 * Handles connection lifecycle for MongoDB using Mongoose
 */
class MongoDBConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.logger = LoggerFactory.named('MongoDB');
  }

  /**
   * Connect to MongoDB
   * @param {string} uri - MongoDB connection URI
   * @returns {Promise<mongoose.Connection>}
   */
  async connect(uri) {
    if (this.isConnected && this.connection) {
      this.logger.debug('MongoDB already connected');
      return this.connection;
    }

    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.connection = mongoose.connection;
      this.isConnected = true;

      // Connection event handlers
      this.connection.on('connected', () => {
        this.logger.info('MongoDB connected successfully');
      });

      this.connection.on('error', (err) => {
        this.logger.error('MongoDB connection error', { error: err });
        this.isConnected = false;
      });

      this.connection.on('disconnected', () => {
        this.logger.info('MongoDB disconnected');
        this.isConnected = false;
      });

      return this.connection;
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', { error });
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected || !this.connection) {
      this.logger.debug('MongoDB not connected, skipping disconnect');
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;
      this.logger.info('MongoDB disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting from MongoDB', { error });
      throw error;
    }
  }

  /**
   * Get the current connection
   * @returns {mongoose.Connection|null}
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isReady() {
    return this.isConnected && this.connection && this.connection.readyState === 1;
  }
}

// Export singleton instance
const mongoDBConnection = new MongoDBConnection();

module.exports = mongoDBConnection;

