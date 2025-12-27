const App = require('../../../domain/entities/app.entity');

/**
 * Create App Use Case
 * Handles creation of new applications
 */
class CreateAppUseCase {
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
   * Execute app creation
   * @param {Object} input - Creation input
   * @param {string} input.app_name - App name
   * @param {string} input.owner_user_id - Owner user ID (from authenticated user)
   * @returns {Promise<Object>} { success: boolean, app?: Object, message?: string, errors?: Array }
   */
  async execute(input) {
    try {
      const { app_name, owner_user_id } = input;

      // Validate input
      if (!app_name || !owner_user_id) {
        return {
          success: false,
          message: 'App name and owner user ID are required',
          errors: ['App name and owner user ID are required']
        };
      }

      // Validate app name
      const nameValidation = App.validateAppName(app_name);
      if (!nameValidation.valid) {
        return {
          success: false,
          message: nameValidation.message,
          errors: [nameValidation.message]
        };
      }

      // Create app entity with generated app_id
      const app = App.create({
        app_name,
        owner_user_id
      });

      // Validate app data
      const validation = App.validate(app.toObject());
      if (!validation.valid) {
        return {
          success: false,
          message: 'Invalid app data',
          errors: validation.errors
        };
      }

      // Save app to repository
      const createdApp = await this.appRepository.create(app.toObject());

      // Return success
      return {
        success: true,
        app: createdApp,
        message: 'App created successfully'
      };

    } catch (error) {
      this.logger.error('CreateAppUseCase error', { error });
      return {
        success: false,
        message: 'Failed to create app',
        errors: [error.message]
      };
    }
  }
}

module.exports = CreateAppUseCase;

