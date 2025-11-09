/**
 * MongoDB Service
 * Handles MongoDB operations for dashboards, users, alerts, and schemas
 */

const Dashboard = require('../../models/mongodb/dashboard.model');
const User = require('../../models/mongodb/user.model');
const Alert = require('../../models/mongodb/alert.model');
const Schema = require('../../models/mongodb/schema.model');
const logger = require('../../utils/logger');

class MongoDBService {
  // ===== DASHBOARD OPERATIONS =====

  /**
   * Create dashboard
   * @param {Object} dashboardData - Dashboard data
   * @returns {Promise<Object>} Created dashboard
   */
  async createDashboard(dashboardData) {
    try {
      const dashboard = new Dashboard(dashboardData);
      await dashboard.save();
      logger.info('Dashboard created', { id: dashboard._id });
      return dashboard;
    } catch (error) {
      logger.error('Dashboard creation error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get dashboard by ID
   * @param {string} dashboardId - Dashboard ID
   * @returns {Promise<Object>} Dashboard
   */
  async getDashboard(dashboardId) {
    try {
      const dashboard = await Dashboard.findById(dashboardId).populate('owner', 'username email');
      if (!dashboard) {
        throw new Error('Dashboard not found');
      }
      return dashboard;
    } catch (error) {
      logger.error('Dashboard get error', { dashboardId, error: error.message });
      throw error;
    }
  }

  /**
   * List dashboards
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Dashboards
   */
  async listDashboards(filters = {}) {
    try {
      const { owner, isPublic, limit = 50, skip = 0 } = filters;
      
      const query = {};
      if (owner) query.owner = owner;
      if (isPublic !== undefined) query.isPublic = isPublic;

      const dashboards = await Dashboard
        .find(query)
        .populate('owner', 'username')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      return dashboards;
    } catch (error) {
      logger.error('Dashboard list error', { error: error.message });
      throw error;
    }
  }

  /**
   * Update dashboard
   * @param {string} dashboardId - Dashboard ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated dashboard
   */
  async updateDashboard(dashboardId, updates) {
    try {
      const dashboard = await Dashboard.findByIdAndUpdate(
        dashboardId,
        { $set: updates },
        { new: true, runValidators: true }
      );
      
      if (!dashboard) {
        throw new Error('Dashboard not found');
      }
      
      logger.info('Dashboard updated', { id: dashboardId });
      return dashboard;
    } catch (error) {
      logger.error('Dashboard update error', { dashboardId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete dashboard
   * @param {string} dashboardId - Dashboard ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteDashboard(dashboardId) {
    try {
      const result = await Dashboard.findByIdAndDelete(dashboardId);
      if (!result) {
        throw new Error('Dashboard not found');
      }
      logger.info('Dashboard deleted', { id: dashboardId });
      return true;
    } catch (error) {
      logger.error('Dashboard delete error', { dashboardId, error: error.message });
      throw error;
    }
  }

  // ===== USER OPERATIONS =====

  /**
   * Create user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    try {
      const user = new User(userData);
      await user.save();
      logger.info('User created', { id: user._id, username: user.username });
      return user;
    } catch (error) {
      logger.error('User creation error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User
   */
  async getUser(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error('User get error', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object>} User
   */
  async getUserByUsername(username) {
    try {
      const user = await User.findOne({ username });
      return user;
    } catch (error) {
      logger.error('User get by username error', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Get user by email
   * @param {string} email - Email
   * @returns {Promise<Object>} User
   */
  async getUserByEmail(email) {
    try {
      const user = await User.findOne({ email });
      return user;
    } catch (error) {
      logger.error('User get by email error', { email, error: error.message });
      throw error;
    }
  }

  // ===== ALERT OPERATIONS =====

  /**
   * Create alert
   * @param {Object} alertData - Alert data
   * @returns {Promise<Object>} Created alert
   */
  async createAlert(alertData) {
    try {
      const alert = new Alert(alertData);
      await alert.save();
      logger.info('Alert created', { id: alert._id, name: alert.name });
      return alert;
    } catch (error) {
      logger.error('Alert creation error', { error: error.message });
      throw error;
    }
  }

  /**
   * List alerts
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Alerts
   */
  async listAlerts(filters = {}) {
    try {
      const { owner, isEnabled } = filters;
      
      const query = {};
      if (owner) query.owner = owner;
      if (isEnabled !== undefined) query.isEnabled = isEnabled;

      const alerts = await Alert.find(query).populate('owner', 'username');
      return alerts;
    } catch (error) {
      logger.error('Alert list error', { error: error.message });
      throw error;
    }
  }

  /**
   * Update alert
   * @param {string} alertId - Alert ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated alert
   */
  async updateAlert(alertId, updates) {
    try {
      const alert = await Alert.findByIdAndUpdate(
        alertId,
        { $set: updates },
        { new: true, runValidators: true }
      );
      
      if (!alert) {
        throw new Error('Alert not found');
      }
      
      logger.info('Alert updated', { id: alertId });
      return alert;
    } catch (error) {
      logger.error('Alert update error', { alertId, error: error.message });
      throw error;
    }
  }

  // ===== SCHEMA OPERATIONS =====

  /**
   * Register schema
   * @param {Object} schemaData - Schema data
   * @returns {Promise<Object>} Registered schema
   */
  async registerSchema(schemaData) {
    try {
      const schema = new Schema(schemaData);
      await schema.save();
      logger.info('Schema registered', { id: schema._id, name: schema.name });
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
      const schema = await Schema.findOne({ name, isActive: true });
      if (!schema) {
        throw new Error('Schema not found');
      }
      return schema;
    } catch (error) {
      logger.error('Schema get error', { name, error: error.message });
      throw error;
    }
  }

  /**
   * List schemas
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Schemas
   */
  async listSchemas(filters = {}) {
    try {
      const { isActive = true } = filters;
      const schemas = await Schema.find({ isActive });
      return schemas;
    } catch (error) {
      logger.error('Schema list error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get schema for service
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Schema
   */
  async getSchemaForService(serviceName) {
    try {
      const schema = await Schema.findOne({ 
        services: serviceName,
        isActive: true 
      });
      return schema;
    } catch (error) {
      logger.error('Schema get for service error', { serviceName, error: error.message });
      throw error;
    }
  }
}

module.exports = new MongoDBService();

