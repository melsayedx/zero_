/**
 * Authentication Controllers
 * Handles HTTP requests for user authentication (register, login, me)
 */

/**
 * Register Controller
 * Handles user registration requests
 */
class RegisterController {
  constructor(registerUserUseCase) {
    this.registerUserUseCase = registerUserUseCase;
  }

  async handle(request, reply) {
    try {
      const { email, password } = request.body;

      // Execute registration use case
      const result = await this.registerUserUseCase.execute({ email, password });

      if (!result.success) {
        return reply.code(400).send(result);
      }

      return reply.code(201).send(result);
    } catch (error) {
      console.error('[RegisterController] Error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Login Controller
 * Handles user login requests
 */
class LoginController {
  constructor(loginUserUseCase) {
    this.loginUserUseCase = loginUserUseCase;
  }

  async handle(request, reply) {
    try {
      const { email, password } = request.body;

      // Execute login use case
      const result = await this.loginUserUseCase.execute({ email, password });

      if (!result.success) {
        return reply.code(401).send(result);
      }

      return reply.code(200).send(result);
    } catch (error) {
      console.error('[LoginController] Error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Me Controller
 * Returns current authenticated user information
 */
class MeController {
  async handle(request, reply) {
    try {
      // User info is already attached by auth middleware
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          message: 'Not authenticated'
        });
      }

      return reply.code(200).send({
        success: true,
        user: request.user
      });
    } catch (error) {
      console.error('[MeController] Error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = {
  RegisterController,
  LoginController,
  MeController
};

