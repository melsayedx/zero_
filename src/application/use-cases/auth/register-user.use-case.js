const argon2 = require('argon2');
const { nanoid } = require('nanoid');
const User = require('../../../domain/entities/user.entity');

/**
 * Register User Use Case
 * Handles user registration with email and password
 */
class RegisterUserUseCase {
  /**
   * @param {UserRepositoryPort} userRepository - User repository implementation
   * @param {Object} [options={}] - Options
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(userRepository, options = {}) {
    this.userRepository = userRepository;
    this.logger = options.logger;
  }

  /**
   * Execute user registration
   * @param {Object} input - Registration input
   * @param {string} input.email - User email
   * @param {string} input.password - User password (plain text)
   * @returns {Promise<Object>} { success: boolean, user?: Object, message?: string, errors?: Array }
   */
  async execute(input) {
    try {
      const { email, password } = input;

      // Validate input
      if (!email || !password) {
        return {
          success: false,
          message: 'Email and password are required',
          errors: ['Email and password are required']
        };
      }

      // Validate email format
      if (!User.isValidEmail(email)) {
        return {
          success: false,
          message: 'Invalid email format',
          errors: ['Invalid email format']
        };
      }

      // Validate password strength
      const passwordValidation = User.validatePassword(password);
      if (!passwordValidation.valid) {
        return {
          success: false,
          message: passwordValidation.message,
          errors: [passwordValidation.message]
        };
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser) {
        return {
          success: false,
          message: 'User with this email already exists',
          errors: ['User with this email already exists']
        };
      }

      // Generate unique user_id
      const user_id = `usr_${nanoid(16)}`;

      // Hash password with Argon2id
      const password_hash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,    // 64 MB
        timeCost: 3,          // 3 iterations
        parallelism: 4        // 4 parallel threads
      });

      // Create user entity
      const userData = {
        user_id,
        email: email.toLowerCase().trim(),
        password_hash,
        created_at: new Date()
      };

      // Validate user data
      const validation = User.validate(userData);
      if (!validation.valid) {
        return {
          success: false,
          message: 'Invalid user data',
          errors: validation.errors
        };
      }

      // Save user to repository
      const createdUser = await this.userRepository.create(userData);

      // Return success (without password hash)
      return {
        success: true,
        user: {
          user_id: createdUser.user_id,
          email: createdUser.email,
          created_at: createdUser.created_at
        },
        message: 'User registered successfully'
      };

    } catch (error) {
      this.logger.error('RegisterUserUseCase error', { error });
      return {
        success: false,
        message: 'Failed to register user',
        errors: [error.message]
      };
    }
  }
}

module.exports = RegisterUserUseCase;

