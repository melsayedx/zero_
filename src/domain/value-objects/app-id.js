class AppId {
  static MIN_LENGTH = 1;
  static MAX_LENGTH = 64;

  /**
   * Creates a new immutable AppId.
   *
   * @param {string} value - App ID string.
   * @throws {Error} If invalid length or type.
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
   * Factory method for creating AppId.
   *
   * @param {string} value - App ID string.
   * @returns {AppId} New instance.
   */
  static create(value) {
    return new AppId(value);
  }

  toString() {
    return this.value;
  }

  valueOf() {
    return this.value;
  }

  equals(other) {
    return other instanceof AppId && this.value === other.value;
  }

  toJSON() {
    return this.value;
  }
}

/**
 * @typedef {AppId} AppId
 * @property {string} value - The application identifier string
 */

module.exports = AppId;

