/**
 * User Entity
 * Represents a user in the system with authentication credentials
 */
class User {
  /**
   * @param {Object} data - User data
   * @param {string} data.user_id - Unique user identifier (generated)
   * @param {string} data.email - User email address
   * @param {string} data.password_hash - Hashed password (Argon2)
   * @param {Date} data.created_at - Creation timestamp
   */
  constructor(data) {
    this.user_id = data.user_id;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.created_at = data.created_at || new Date();
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    // Basic email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} { valid: boolean, message: string }
   */
  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: 'Password is required' };
    }

    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }

    if (password.length > 128) {
      return { valid: false, message: 'Password must be less than 128 characters' };
    }

    // Check for at least one letter and one number
    // TODO: Add more complex password validation and pre-compiled regex for performance
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      return { 
        valid: false, 
        message: 'Password must contain at least one letter and one number' 
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validate user data
   * @param {Object} data - User data to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validate(data) {
    const errors = [];

    if (!data.user_id || typeof data.user_id !== 'string') {
      errors.push('User ID is required');
    } else if (data.user_id.length > 50) {
      errors.push('User ID must be less than 50 characters');
    }

    if (!User.isValidEmail(data.email)) {
      errors.push('Valid email address is required');
    }

    if (!data.password_hash || typeof data.password_hash !== 'string') {
      errors.push('Password hash is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a user entity from plain object
   * @param {Object} data - User data
   * @returns {User} User instance
   */
  static fromObject(data) {
    return new User(data);
  }

  /**
   * Convert user to plain object (without password hash)
   * @returns {Object} User data without sensitive information
   */
  toPublicObject() {
    return {
      user_id: this.user_id,
      email: this.email,
      created_at: this.created_at
    };
  }

  /**
   * Convert user to plain object (with password hash)
   * @returns {Object} Complete user data
   */
  toObject() {
    return {
      user_id: this.user_id,
      email: this.email,
      password_hash: this.password_hash,
      created_at: this.created_at
    };
  }
}

module.exports = User;

