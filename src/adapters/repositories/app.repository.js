const mongoose = require('mongoose');
const AppRepositoryPort = require('../../core/ports/app-repository.port');

/**
 * Mongoose Schema for App
 */
const appSchema = new mongoose.Schema({
  app_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    maxlength: 32
  },
  app_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  owner_user_id: {
    type: String,
    required: true,
    index: true,
    maxlength: 50
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  collection: 'apps',
  timestamps: false // We're managing created_at manually
});

// Create indexes for faster queries
appSchema.index({ app_id: 1 }, { unique: true });
appSchema.index({ owner_user_id: 1 });
appSchema.index({ owner_user_id: 1, app_id: 1 }); // Compound index for ownership verification

/**
 * App Repository Implementation using MongoDB (Mongoose)
 * Implements AppRepositoryPort interface
 */
class AppRepository extends AppRepositoryPort {
  constructor() {
    super();
    this.model = mongoose.model('App', appSchema);
  }

  /**
   * Create a new app
   * @param {Object} appData - App data
   * @returns {Promise<Object>} Created app object
   * @throws {Error} If app creation fails
   */
  async create(appData) {
    try {
      const app = new this.model(appData);
      const savedApp = await app.save();
      return this._toPlainObject(savedApp);
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('App with this app_id already exists');
      }
      throw new Error(`Failed to create app: ${error.message}`);
    }
  }

  /**
   * Find an app by app_id
   * @param {string} appId - App ID
   * @returns {Promise<Object|null>} App object or null if not found
   */
  async findByAppId(appId) {
    try {
      const app = await this.model.findOne({ app_id: appId }).lean();
      return app;
    } catch (error) {
      throw new Error(`Failed to find app: ${error.message}`);
    }
  }

  /**
   * Find all apps owned by a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of app objects
   */
  async findByOwnerId(userId) {
    try {
      const apps = await this.model
        .find({ owner_user_id: userId })
        .sort({ created_at: -1 })
        .lean();
      return apps;
    } catch (error) {
      throw new Error(`Failed to find apps by owner: ${error.message}`);
    }
  }

  /**
   * Verify if a user owns a specific app
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user owns the app
   */
  async verifyOwnership(appId, userId) {
    try {
      const count = await this.model.countDocuments({
        app_id: appId,
        owner_user_id: userId
      });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to verify app ownership: ${error.message}`);
    }
  }

  /**
   * Check if an app exists by app_id
   * @param {string} appId - App ID
   * @returns {Promise<boolean>} True if app exists
   */
  async exists(appId) {
    try {
      const count = await this.model.countDocuments({ app_id: appId });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to check app existence: ${error.message}`);
    }
  }

  /**
   * Update app data
   * @param {string} appId - App ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated app object or null if not found
   */
  async update(appId, updates) {
    try {
      const app = await this.model.findOneAndUpdate(
        { app_id: appId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
      return app;
    } catch (error) {
      throw new Error(`Failed to update app: ${error.message}`);
    }
  }

  /**
   * Delete an app
   * @param {string} appId - App ID
   * @returns {Promise<boolean>} True if app was deleted
   */
  async delete(appId) {
    try {
      const result = await this.model.deleteOne({ app_id: appId });
      return result.deletedCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete app: ${error.message}`);
    }
  }

  /**
   * Count apps owned by a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of apps owned by user
   */
  async countByOwnerId(userId) {
    try {
      const count = await this.model.countDocuments({ owner_user_id: userId });
      return count;
    } catch (error) {
      throw new Error(`Failed to count apps: ${error.message}`);
    }
  }

  /**
   * Convert Mongoose document to plain object
   * @private
   */
  _toPlainObject(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    // Remove MongoDB _id and __v fields
    delete obj._id;
    delete obj.__v;
    return obj;
  }
}

module.exports = AppRepository;

