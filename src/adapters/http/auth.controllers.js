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

  async handle(req, res) {
    try {
      const { email, password } = req.body;

      // Execute registration use case
      const result = await this.registerUserUseCase.execute({ email, password });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      console.error('[RegisterController] Error:', error);
      return res.status(500).json({
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

  async handle(req, res) {
    try {
      const { email, password } = req.body;

      // Execute login use case
      const result = await this.loginUserUseCase.execute({ email, password });

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LoginController] Error:', error);
      return res.status(500).json({
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
  async handle(req, res) {
    try {
      // User info is already attached by auth middleware
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
      }

      return res.status(200).json({
        success: true,
        user: req.user
      });
    } catch (error) {
      console.error('[MeController] Error:', error);
      return res.status(500).json({
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

