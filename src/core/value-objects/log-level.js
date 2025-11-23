/**
 * LogLevel Value Object - Immutable log level representation with singleton pattern.
 *
 * This class provides a type-safe, immutable representation of log levels with built-in
 * validation and normalization. It uses a singleton pattern to ensure that equivalent
 * log levels always reference the same instance, optimizing memory usage.
 *
 * Valid log levels: DEBUG, INFO, WARN, ERROR, FATAL
 *
 * @example
 * ```javascript
 * // Direct access to singleton instances (recommended)
 * const info = LogLevel.INFO;
 * const error = LogLevel.ERROR;
 *
 * // Dynamic access with validation
 * const warn = LogLevel.get('warn'); // case-insensitive
 * const debug = LogLevel.get('DEBUG');
 *
 * // Validation without instantiation
 * LogLevel.isValid('info'); // true
 * LogLevel.isValid('INVALID'); // false
 *
 * // Usage in comparisons (identity comparison due to singletons)
 * if (logEntry.level === LogLevel.ERROR) {
 *   // Handle error level logs
 * }
 *
 * // Get all valid levels for UI/configuration
 * const levels = LogLevel.getValidLevels(); // Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])
 * ```
 *
 * @example
 * ```javascript
 * // This will throw an error (private constructor):
 * try {
 *   new LogLevel('debug');
 * } catch (error) {
 *   console.log(error.message); // "LogLevel cannot be instantiated directly..."
 * }
 * ```
 */
class LogLevel {
  /**
   * Private symbol to control constructor access and prevent external instantiation.
   * @type {symbol}
   */
  static #privateConstructor = Symbol('LogLevel.privateConstructor');

  /**
   * Valid log level values - centralized definition for easy maintenance.
   * @type {Set<string>}
   */
  static #VALID_LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);

  /**
   * Dynamically create static singleton instances for all valid log levels.
   *
   * This static block executes once when the class is loaded, creating pre-initialized
   * instances for each valid log level. This ensures:
   * - Singleton pattern (same string value = same instance)
   * - Fast access via LogLevel.DEBUG, LogLevel.INFO, etc.
   * - Memory efficiency (no duplicate instances)
   * - Strict enforcement of singleton pattern
   */
  static {
    for (const level of LogLevel.#VALID_LEVELS) {
      // level is already normalized (uppercase), so pass it directly
      LogLevel[level] = new LogLevel(LogLevel.#privateConstructor, level);
    }
  }

  /**
   * Private constructor to enforce singleton pattern and prevent external instantiation.
   *
   * This constructor is intentionally private and will throw an error if called directly.
   * LogLevel instances should only be accessed through the pre-created singleton instances
   * or the LogLevel.get() method.
   *
   * @param {symbol} secret - Private symbol required for internal construction
   * @param {string} normalizedValue - Pre-normalized log level string (uppercase, trimmed)
   * @throws {Error} Always throws when called without the private symbol
   *
   * @example
   * ```javascript
   * // This will throw an error:
   * new LogLevel('debug'); // Error: LogLevel cannot be instantiated directly
   *
   * // Correct usage:
   * const info = LogLevel.INFO;        // Direct singleton access
   * const warn = LogLevel.get('warn'); // Dynamic access with validation
   * ```
   *
   */
  constructor(secret, normalizedValue) {
    // Private symbol to prevent external instantiation
    if (secret !== LogLevel.#privateConstructor) {
      throw new Error(
        'LogLevel cannot be instantiated directly. Use LogLevel.get() or access static instances like LogLevel.INFO'
      );
    }

    // Value is already normalized and validated by caller
    this.value = normalizedValue;
    Object.freeze(this);
  }

  /**
   * Normalize a log level string for consistent processing.
   *
   * Performs case normalization (uppercase) and whitespace trimming to ensure
   * consistent comparison and storage of log level values.
   *
   * @param {string} value - Raw log level string
   * @returns {string} Normalized uppercase string with no leading/trailing whitespace
   *
   * @example
   * ```javascript
   * // #normalizeValue(' debug ') → 'DEBUG'
   * // #normalizeValue('Info') → 'INFO'
   * ```
   */
  static #normalizeValue(value) {
    return value.toUpperCase().trim();
  }

  /**
   * Get a LogLevel singleton instance by string value.
   *
   * This is the primary method for dynamically obtaining LogLevel instances.
   * It performs validation, normalization, and returns the appropriate singleton instance.
   *
   * @param {string} value - Log level string (case-insensitive, auto-trimmed)
   * @returns {LogLevel} The singleton LogLevel instance
   * @throws {Error} If value is not a string or not a valid log level
   *
   * @example
   * ```javascript
   * // All of these return the same singleton instance:
   * LogLevel.get('debug') === LogLevel.DEBUG; // true
   * LogLevel.get('DEBUG') === LogLevel.DEBUG; // true
   * LogLevel.get(' debug ') === LogLevel.DEBUG; // true (trimmed)
   *
   * // Invalid levels throw errors:
   * LogLevel.get('invalid'); // throws Error
   * ```
   *
   * Uses optimized switch statement for O(1) lookup instead of hash table access,
   * providing better performance for known values.
   */
  static get(value) {
    if (typeof value !== 'string') {
      throw new Error('Log level must be a string');
    }

    const normalizedValue = LogLevel.#normalizeValue(value);

    const instance = LogLevel[normalizedValue];
    if (!instance) {
      throw new Error(`Invalid log level: '${value}'. Must be string and one of: ${Array.from(LogLevel.#VALID_LEVELS).join(', ')}`);
    }
    return instance;
  }

  /**
   * Check if a value represents a valid log level.
   *
   * Performs the same normalization as other methods (uppercase, trim) before validation.
   * This is a pure validation method that doesn't create instances.
   *
   * @param {string} value - Value to validate
   * @returns {boolean} True if the value is a valid log level string
   *
   * @example
   * ```javascript
   * LogLevel.isValid('INFO');    // true
   * LogLevel.isValid('info');    // true (case-insensitive)
   * LogLevel.isValid(' debug '); // true (auto-trimmed)
   * LogLevel.isValid('INVALID'); // false
   * LogLevel.isValid(123);       // false (not a string)
   * ```
   */
  static isValid(value) {
    return typeof value === 'string' && LogLevel.#VALID_LEVELS.has(LogLevel.#normalizeValue(value));
  }

  /**
   * Get the string representation of this log level.
   *
   * @returns {string} The normalized log level string (always uppercase)
   *
   * @example
   * ```javascript
   * LogLevel.INFO.toString(); // 'INFO'
   * String(LogLevel.DEBUG);   // 'DEBUG' (implicit toString)
   * ```
   */
  toString() {
    return this.value;
  }

  /**
   * Check equality with another LogLevel instance.
   *
   * Since LogLevel uses singletons, identical values will always be the same instance.
   * However, this method provides a clean equality check for type safety.
   *
   * @param {*} other - Value to compare with this LogLevel
   * @returns {boolean} True if other is a LogLevel with the same value
   *
   * @example
   * ```javascript
   * const info1 = LogLevel.get('info');
   * const info2 = LogLevel.INFO;
   * const debug = LogLevel.DEBUG;
   *
   * info1.equals(info2); // true (same singleton instance)
   * info1.equals(debug); // false (different values)
   * info1.equals('INFO'); // false (not a LogLevel instance)
   * ```
   */
  equals(other) {
    return other instanceof LogLevel && this.value === other.value;
  }

}

/**
 * @typedef {LogLevel} LogLevel
 * @property {string} value - The normalized log level string
 * @property {LogLevel} DEBUG - DEBUG level singleton instance
 * @property {LogLevel} INFO - INFO level singleton instance
 * @property {LogLevel} WARN - WARN level singleton instance
 * @property {LogLevel} ERROR - ERROR level singleton instance
 * @property {LogLevel} FATAL - FATAL level singleton instance
 */

module.exports = LogLevel;
