const { nanoid } = require('nanoid');

// TODO: This class should not depend on nanoid and should verify the app_id format before saving to the database
//       Also, created date should be removed from insertion as it will automatically set by the database
//       Better validation and pre-compiled regex for performance

/**
 * App Entity
 * Represents an application/project that generates logs
 */
class App {
  /**
   * @param {Object} data - App data
   * @param {string} data.app_id - Unique app identifier (generated with nanoid)
   * @param {string} data.app_name - Human-readable app name
   * @param {string} data.owner_user_id - User ID of the app owner
   * @param {Date} data.created_at - Creation timestamp
   */
  constructor(data) {
    this.app_id = data.app_id;
    this.app_name = data.app_name;
    this.owner_user_id = data.owner_user_id;
    this.created_at = data.created_at || new Date();
  }

  /**
   * Generate a unique app_id
   * Uses nanoid with custom alphabet and length to ensure compatibility with ClickHouse constraints
   * @returns {string} Unique app_id (format: app_XXXXXXXXXXXXX)
   */
  static generateAppId() {
    // Generate ID: 'app_' prefix + 16 characters = 20 chars total (within 32 char limit)
    const id = nanoid(16);
    return `app_${id}`;
  }

  /**
   * Validate app name
   * @param {string} name - App name to validate
   * @returns {Object} { valid: boolean, message: string }
   */
  static validateAppName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, message: 'App name is required' };
    }

    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return { valid: false, message: 'App name cannot be empty' };
    }

    if (trimmedName.length > 100) {
      return { valid: false, message: 'App name must be less than 100 characters' };
    }

    // Check for valid characters (alphanumeric, spaces, hyphens, underscores)
    const validNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validNameRegex.test(trimmedName)) {
      return { 
        valid: false, 
        message: 'App name can only contain letters, numbers, spaces, hyphens, and underscores' 
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validate app_id format
   * @param {string} appId - App ID to validate
   * @returns {boolean} True if valid
   */
  static isValidAppId(appId) {
    if (!appId || typeof appId !== 'string') {
      return false;
    }

    // Must start with 'app_' and be within ClickHouse constraint (1-32 chars)
    return appId.startsWith('app_') && appId.length > 4 && appId.length <= 32;
  }

  /**
   * Validate app data
   * @param {Object} data - App data to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validate(data) {
    const errors = [];

    if (!App.isValidAppId(data.app_id)) {
      errors.push('Valid app_id is required (must start with "app_" and be 5-32 characters)');
    }

    const nameValidation = App.validateAppName(data.app_name);
    if (!nameValidation.valid) {
      errors.push(nameValidation.message);
    }

    if (!data.owner_user_id || typeof data.owner_user_id !== 'string') {
      errors.push('Owner user ID is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create an app entity from plain object
   * @param {Object} data - App data
   * @returns {App} App instance
   */
  static fromObject(data) {
    return new App(data);
  }

  /**
   * Create a new app with generated app_id
   * @param {Object} data - App data (without app_id)
   * @param {string} data.app_name - App name
   * @param {string} data.owner_user_id - Owner user ID
   * @returns {App} New app instance
   */
  static create(data) {
    return new App({
      app_id: App.generateAppId(),
      app_name: data.app_name.trim(),
      owner_user_id: data.owner_user_id,
      created_at: new Date()
    });
  }

  /**
   * Convert app to plain object
   * @returns {Object} App data
   */
  toObject() {
    return {
      app_id: this.app_id,
      app_name: this.app_name,
      owner_user_id: this.owner_user_id,
      created_at: this.created_at
    };
  }
}

module.exports = App;

