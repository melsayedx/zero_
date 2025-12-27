/** Immutable log level value object with singleton pattern. */
class LogLevel {
  static #privateConstructor = Symbol('LogLevel.privateConstructor');

  static #VALID_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  /** Fast lookup set. */
  static #VALID_LEVELS_SET = new Set(LogLevel.#VALID_LEVELS);

  /** Initialize singletons. */
  static {
    for (let i = 0; i < LogLevel.#VALID_LEVELS.length; i++) {
      const level = LogLevel.#VALID_LEVELS[i];
      LogLevel[level] = new LogLevel(LogLevel.#privateConstructor, level);
    }
  }

  /**
   * Private constructor.
   *
   * @param {symbol} secret - Access token.
   * @param {string} normalizedValue - Log level.
   * @throws {Error} If called externally.
   */
  constructor(secret, normalizedValue) {
    if (secret !== LogLevel.#privateConstructor) {
      throw new Error(
        'LogLevel cannot be instantiated directly. Use LogLevel.get() or access static instances like LogLevel.INFO'
      );
    }

    this.value = normalizedValue;
    Object.freeze(this);
  }

  /**
   * Normalizes log level strings.
   *
   * @param {string} value - Raw string.
   * @returns {string} Normalized string.
   */
  static #normalizeValue(value) {
    return value.toUpperCase().trim();
  }

  /**
   * Gets a LogLevel singleton.
   *
   * @param {string} value - Log level string.
   * @returns {LogLevel} Singleton instance.
   * @throws {Error} If invalid.
   */
  static get(value) {
    if (typeof value !== 'string') {
      throw new Error('Log level must be a string');
    }

    const normalizedValue = LogLevel.#normalizeValue(value);

    const instance = LogLevel[normalizedValue];
    if (!instance) {
      throw new Error(`Invalid log level: '${value}'. Must be string and one of: ${LogLevel.#VALID_LEVELS.join(', ')}`);
    }
    return instance;
  }

  static isValid(value) {
    return typeof value === 'string' && LogLevel.#VALID_LEVELS_SET.has(LogLevel.#normalizeValue(value));
  }

  toString() {
    return this.value;
  }

  equals(other) {
    return other instanceof LogLevel && this.value === other.value;
  }

  /**
   * Gets LogLevel from index or string.
   *
   * @param {number|string} value - Ordinal or string.
   * @returns {LogLevel} LogLevel instance.
   */
  static fromValue(value) {
    if (typeof value === 'string') {
      return LogLevel.get(value);
    }

    const levelName = LogLevel.#VALID_LEVELS[value];
    return levelName ? LogLevel[levelName] : LogLevel.INFO;
  }

}

module.exports = LogLevel;

