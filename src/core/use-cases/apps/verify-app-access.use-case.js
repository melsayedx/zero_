/**
 * Verify App Access Use Case
 * Verifies if a user has access to a specific app (ownership check)
 */
class VerifyAppAccessUseCase {
  /**
   * @param {AppRepositoryPort} appRepository - App repository implementation
   */
  constructor(appRepository) {
    this.appRepository = appRepository;
  }

  /**
   * Execute app access verification
   * @param {Object} input - Input parameters
   * @param {string} input.app_id - App ID to verify access to
   * @param {string} input.user_id - User ID (from authenticated user)
   * @returns {Promise<Object>} { success: boolean, hasAccess: boolean, app?: Object, message?: string }
   */
  async execute(input) {
    try {
      const { app_id, user_id } = input;

      // Validate input
      if (!app_id || !user_id) {
        return {
          success: false,
          hasAccess: false,
          message: 'App ID and User ID are required'
        };
      }

      // Check if app exists
      const app = await this.appRepository.findByAppId(app_id);
      if (!app) {
        return {
          success: true,
          hasAccess: false,
          message: 'App not found'
        };
      }

      // Verify ownership
      const hasAccess = await this.appRepository.verifyOwnership(app_id, user_id);

      return {
        success: true,
        hasAccess,
        app: hasAccess ? app : undefined,
        message: hasAccess ? 'Access granted' : 'Access denied'
      };

    } catch (error) {
      console.error('[VerifyAppAccessUseCase] Error:', error);
      return {
        success: false,
        hasAccess: false,
        message: 'Failed to verify app access',
        error: error.message
      };
    }
  }

  /**
   * Verify access and throw error if denied (convenient for middleware/controllers)
   * @param {Object} input - Input parameters
   * @returns {Promise<Object>} App object if access granted
   * @throws {Error} If access denied
   */
  async verifyOrThrow(input) {
    const result = await this.execute(input);
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to verify app access');
    }

    if (!result.hasAccess) {
      throw new Error('You do not have access to this app');
    }

    return result.app;
  }
}

module.exports = VerifyAppAccessUseCase;

