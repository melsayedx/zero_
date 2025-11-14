/**
 * App Controllers
 * Handles HTTP requests for app management (create, list, get)
 */

/**
 * Create App Controller
 * Handles app creation requests
 */
class CreateAppController {
  constructor(createAppUseCase) {
    this.createAppUseCase = createAppUseCase;
  }

  async handle(req, res) {
    try {
      const { app_name } = req.body;
      const { user_id } = req.user; // From auth middleware

      // Execute create app use case
      const result = await this.createAppUseCase.execute({
        app_name,
        owner_user_id: user_id
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      console.error('[CreateAppController] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

/**
 * List Apps Controller
 * Retrieves all apps owned by the authenticated user
 */
class ListAppsController {
  constructor(listUserAppsUseCase) {
    this.listUserAppsUseCase = listUserAppsUseCase;
  }

  async handle(req, res) {
    try {
      const { user_id } = req.user; // From auth middleware

      // Execute list apps use case
      const result = await this.listUserAppsUseCase.execute({ user_id });

      return res.status(200).json(result);
    } catch (error) {
      console.error('[ListAppsController] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        apps: [],
        count: 0
      });
    }
  }
}

/**
 * Get App Controller
 * Retrieves a specific app by app_id (with ownership verification)
 */
class GetAppController {
  constructor(verifyAppAccessUseCase) {
    this.verifyAppAccessUseCase = verifyAppAccessUseCase;
  }

  async handle(req, res) {
    try {
      const { app_id } = req.params;
      const { user_id } = req.user; // From auth middleware

      // Verify access and get app
      const result = await this.verifyAppAccessUseCase.execute({ app_id, user_id });

      if (!result.success) {
        return res.status(500).json(result);
      }

      if (!result.hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this app'
        });
      }

      return res.status(200).json({
        success: true,
        app: result.app,
        message: 'App retrieved successfully'
      });
    } catch (error) {
      console.error('[GetAppController] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = {
  CreateAppController,
  ListAppsController,
  GetAppController
};

