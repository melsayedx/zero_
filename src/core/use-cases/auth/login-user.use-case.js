const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

/**
 * Login User Use Case
 * Handles user authentication and JWT token generation
 */
class LoginUserUseCase {
  /**
   * @param {UserRepositoryPort} userRepository - User repository implementation
   */
  constructor(userRepository) {
    this.userRepository = userRepository;
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.jwtExpiration = process.env.JWT_EXPIRATION || '7d';
  }

  /**
   * Execute user login
   * @param {Object} input - Login input
   * @param {string} input.email - User email
   * @param {string} input.password - User password (plain text)
   * @returns {Promise<Object>} { success: boolean, token?: string, user?: Object, message?: string }
   */
  async execute(input) {
    try {
      const { email, password } = input;

      // Validate input
      if (!email || !password) {
        return {
          success: false,
          message: 'Email and password are required'
        };
      }

      // Find user by email
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Verify password with Argon2
      const isPasswordValid = await argon2.verify(user.password_hash, password);
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          user_id: user.user_id,
          email: user.email
        },
        this.jwtSecret,
        {
          expiresIn: this.jwtExpiration,
          issuer: 'log-platform',
          subject: user.user_id
        }
      );

      // Return success with token and user info
      return {
        success: true,
        token,
        user: {
          user_id: user.user_id,
          email: user.email,
          created_at: user.created_at
        },
        message: 'Login successful'
      };

    } catch (error) {
      console.error('[LoginUserUseCase] Error:', error);
      return {
        success: false,
        message: 'Failed to login',
        error: error.message
      };
    }
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token to verify
   * @returns {Promise<Object>} { valid: boolean, payload?: Object, message?: string }
   */
  async verifyToken(token) {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      return {
        valid: true,
        payload: {
          user_id: payload.user_id,
          email: payload.email
        }
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          message: 'Token has expired'
        };
      }
      if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          message: 'Invalid token'
        };
      }
      return {
        valid: false,
        message: 'Token verification failed'
      };
    }
  }
}

module.exports = LoginUserUseCase;

