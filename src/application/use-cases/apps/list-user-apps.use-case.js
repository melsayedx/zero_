/**
 * List User Apps Use Case
 * Retrieves all apps owned by a user
 */
class ListUserAppsUseCase {
  /**
   * @param {AppRepositoryContract} appRepository - App repository implementation
   * @param {Object} [options={}] - Options
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(appRepository, options = {}) {
    this.appRepository = appRepository;
    this.logger = options.logger;
  }

  /**
   * Execute list user apps
   * @param {Object} input - Input parameters
   * @param {string} input.user_id - User ID (from authenticated user)
   * @returns {Promise<Object>} { success: boolean, apps?: Array, count?: number, message?: string }
   */
  async execute(input) {
    try {
      const { user_id } = input;

      // Validate input
      if (!user_id) {
        return {
          success: false,
          message: 'User ID is required',
          apps: [],
          count: 0
        };
      }

      // Fetch apps from repository
      const apps = await this.appRepository.findByOwnerId(user_id);

      // Return success
      return {
        success: true,
        apps: apps || [],
        count: apps ? apps.length : 0,
        message: 'Apps retrieved successfully'
      };

    } catch (error) {
      if (this.logger) {
        this.logger.error('ListUserAppsUseCase error', { error });
      }
      return {
        success: false,
        message: 'Failed to retrieve apps',
        apps: [],
        count: 0,
        error: error.message
      };
    }
  }
}

module.exports = ListUserAppsUseCase;

