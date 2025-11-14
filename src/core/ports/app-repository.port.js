/**
 * App Repository Port (Interface)
 * Defines the contract for app data persistence
 * 
 * In hexagonal architecture, this is an OUTPUT PORT that the core depends on.
 * Concrete implementations (like MongoDBAppRepository) will implement this interface.
 */
class AppRepositoryPort {
  /**
   * Create a new app
   * @param {Object} appData - App data
   * @param {string} appData.app_id - Unique app identifier
   * @param {string} appData.app_name - App name
   * @param {string} appData.owner_user_id - Owner user ID
   * @returns {Promise<Object>} Created app object
   * @throws {Error} If app creation fails
   */
  async create(appData) {
    throw new Error('Method not implemented: create');
  }

  /**
   * Find an app by app_id
   * @param {string} appId - App ID
   * @returns {Promise<Object|null>} App object or null if not found
   * @throws {Error} If query fails
   */
  async findByAppId(appId) {
    throw new Error('Method not implemented: findByAppId');
  }

  /**
   * Find all apps owned by a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of app objects
   * @throws {Error} If query fails
   */
  async findByOwnerId(userId) {
    throw new Error('Method not implemented: findByOwnerId');
  }

  /**
   * Verify if a user owns a specific app
   * @param {string} appId - App ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user owns the app
   * @throws {Error} If query fails
   */
  async verifyOwnership(appId, userId) {
    throw new Error('Method not implemented: verifyOwnership');
  }

  /**
   * Check if an app exists by app_id
   * @param {string} appId - App ID
   * @returns {Promise<boolean>} True if app exists
   * @throws {Error} If query fails
   */
  async exists(appId) {
    throw new Error('Method not implemented: exists');
  }

  /**
   * Update app data
   * @param {string} appId - App ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated app object or null if not found
   * @throws {Error} If update fails
   */
  async update(appId, updates) {
    throw new Error('Method not implemented: update');
  }

  /**
   * Delete an app
   * @param {string} appId - App ID
   * @returns {Promise<boolean>} True if app was deleted
   * @throws {Error} If deletion fails
   */
  async delete(appId) {
    throw new Error('Method not implemented: delete');
  }

  /**
   * Count apps owned by a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of apps owned by user
   * @throws {Error} If query fails
   */
  async countByOwnerId(userId) {
    throw new Error('Method not implemented: countByOwnerId');
  }
}

module.exports = AppRepositoryPort;

