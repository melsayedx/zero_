/**
 * AppId Value Object - Immutable application identifier representation.
 *
 * This class provides an immutable container for application identifiers with built-in
 * validation and length constraints. It supports various naming conventions including
 * generated IDs using the 'app_' + nanoid format.
 *
 * Key features:
 * - Immutable application ID storage
 * - Length validation (1-64 characters)
 * - Support for generated IDs ('app_' + nanoid)
 * - Consistent value object interface
 *
 * @example
 * ```javascript
 * // Create with custom app ID
 * const appId = new AppId('my-application');
 *
 * // Create with generated nanoid format
 * const generatedId = new AppId('app_' + nanoid());
 * logger.info(generatedId.value); // 'app_abc123def456...'
 *
 * // Using factory method
 * const app = AppId.create('production-app');
 *
 * // Validation examples
 * new AppId('a');        // ✅ Valid (1 char minimum)
 * new AppId('a'.repeat(64)); // ✅ Valid (64 char maximum)
 * // new AppId('');       // ❌ Error: too short
 * // new AppId('a'.repeat(65)); // ❌ Error: too long
 * ```
 */
class AppId {
  /**
   * Minimum allowed length for application ID strings.
   * @type {number}
   */
  static MIN_LENGTH = 1;

  /**
   * Maximum allowed length for application ID strings.
   * @type {number}
   */
  static MAX_LENGTH = 64;

  /**
   * Create a new AppId instance.
   *
   * Performs validation on the application ID string including type checking and length
   * constraints. Supports various naming conventions including custom names and generated
   * IDs using the 'app_' + nanoid format.
   *
   * @param {string} value - Application identifier string
   * @throws {Error} If value is not a string or doesn't meet length requirements
   *
   * @example
   * ```javascript
   * // Custom application names
   * const prodApp = new AppId('production-api');
   * const webApp = new AppId('web-frontend');
   *
   * // Generated IDs with nanoid
   * import { nanoid } from 'nanoid';
   * const generatedApp = new AppId('app_' + nanoid());
   * // Result: 'app_abc123def456...' (21 chars total)
   *
   * // Edge cases
   * const minLength = new AppId('a');        // ✅ 1 character minimum
   * const maxLength = new AppId('a'.repeat(64)); // ✅ 64 characters maximum
   *
   * // Invalid cases (would throw):
   * // new AppId(123);                    // Not a string
   * // new AppId('');                     // Too short (< 1)
   * // new AppId('a'.repeat(65));        // Too long (> 64)
   * ```
   */
  constructor(value) {
    if (typeof value !== 'string') {
      throw new Error('App ID must be a string');
    }

    if (value.length < AppId.MIN_LENGTH || value.length > AppId.MAX_LENGTH) {
      throw new Error(`App ID must be between ${AppId.MIN_LENGTH} and ${AppId.MAX_LENGTH} character(s) long`);
    }

    this.value = value;
    Object.freeze(this);
  }

  /**
   * Factory method to create an AppId instance.
   *
   * Provides a consistent interface for creating AppId instances across the application.
   * Allows for future enhancements like ID generation, validation customization,
   * or alternative creation strategies without breaking existing code.
   *
   * Benefits of factory method pattern:
   * - Consistent creation interface across value objects
   * - Enables future ID generation features
   * - Allows validation customization per use case
   * - Self-documenting creation method
   *
   * @param {string} value - Application identifier string
   * @returns {AppId} New AppId instance
   *
   * @example
   * ```javascript
   * // Standard usage
   * const appId = AppId.create('my-application');
   *
   * // Future: could support auto-generation
   * // const generatedId = AppId.create(); // auto-generate 'app_' + nanoid()
   *
   * // Equivalent to constructor (but future-proof)
   * const sameAppId = new AppId('my-application');
   * ```
   */
  static create(value) {
    return new AppId(value);
  }

  /**
   * Get string representation of the application ID.
   *
   * Returns the application ID string. This method is called implicitly
   * when the object is converted to a string (e.g., in template literals).
   *
   * @returns {string} The application ID string
   *
   * @example
   * ```javascript
   * const appId = new AppId('my-app');
   * logger.info(`Application: ${appId}`); // Implicit toString()
   * logger.info(appId.toString());        // Explicit call
   * ```
   */
  toString() {
    return this.value;
  }

  /**
   * Get the primitive value for string operations.
   *
   * Returns the underlying string value for use in string contexts and operations.
   * Enables implicit conversion in string concatenation and comparisons.
   *
   * @returns {string} The primitive application ID string
   *
   * @example
   * ```javascript
   * const appId = new AppId('my-app');
   *
   * // Implicit conversion in string operations
   * const fullId = appId + '-v1';        // 'my-app-v1'
   * const compared = appId == 'my-app';  // true (loose equality)
   *
   * // Explicit primitive access
   * const primitive = appId.valueOf();   // 'my-app'
   * ```
   */
  valueOf() {
    return this.value;
  }

  /**
   * Check equality with another AppId instance.
   *
   * Performs identity comparison based on the application ID value.
   * Useful for determining if two AppId instances represent the same application.
   *
   * @param {*} other - Value to compare with this AppId
   * @returns {boolean} True if other is an AppId with identical value
   *
   * @example
   * ```javascript
   * const app1 = new AppId('production-api');
   * const app2 = new AppId('production-api');
   * const app3 = new AppId('staging-api');
   *
   * app1.equals(app2); // true (same application)
   * app1.equals(app3); // false (different application)
   * app1.equals('production-api'); // false (not an AppId instance)
   * ```
   */
  equals(other) {
    return other instanceof AppId && this.value === other.value;
  }

  /**
   * Get JSON representation for serialization.
   *
   * Returns the primitive string value for JSON serialization. This method is
   * automatically called by JSON.stringify() and ensures proper serialization
   * of AppId instances in JSON output.
   *
   * Benefits even when not explicitly used:
   * - Automatic JSON serialization support
   * - Consistent serialization across environments
   * - Enables AppId in JSON.stringify() contexts
   *
   * @returns {string} The application ID value for JSON serialization
   *
   * @example
   * ```javascript
   * const appId = new AppId('web-frontend');
   *
   * // Automatic JSON serialization
   * JSON.stringify({ app: appId }); // '{"app":"web-frontend"}'
   *
   * // Manual serialization
   * const jsonValue = appId.toJSON(); // 'web-frontend'
   * ```
   */
  toJSON() {
    return this.value;
  }
}

/**
 * @typedef {AppId} AppId
 * @property {string} value - The application identifier string
 */

module.exports = AppId;

