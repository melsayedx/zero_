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

  async handle(request, reply) {
    try {
      const { app_name } = request.body;
      const { user_id } = request.user; // From auth middleware

      // Execute create app use case
      const result = await this.createAppUseCase.execute({
        app_name,
        owner_user_id: user_id
      });

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.code(201).send(result);
    } catch (error) {
      console.error('[CreateAppController] Error:', error);
      return reply.code(500).send({
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

  async handle(request, reply) {
    try {
      const { user_id } = request.user; // From auth middleware

      // Execute list apps use case
      const result = await this.listUserAppsUseCase.execute({ user_id });

      return reply.code(200).send(result);
    } catch (error) {
      console.error('[ListAppsController] Error:', error);
      return reply.code(500).send({
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

  async handle(request, reply) {
    try {
      const { app_id } = request.params;
      const { user_id } = request.user; // From auth middleware

      // Verify access and get app
      const result = await this.verifyAppAccessUseCase.execute({ app_id, user_id });

      if (!result.success) {
        return reply.code(500).send(result);
      }

      if (!result.hasAccess) {
        return reply.code(403).send({
          success: false,
          message: 'You do not have access to this app'
        });
      }

      return reply.code(200).send({
        success: true,
        app: result.app,
        message: 'App retrieved successfully'
      });
    } catch (error) {
      console.error('[GetAppController] Error:', error);
      return reply.code(500).send({
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

