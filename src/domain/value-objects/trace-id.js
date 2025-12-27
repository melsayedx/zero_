class TraceId {
  /** UUID validation regex (disabled). */
  static UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Creates a new immutable TraceId.
   *
   * @param {string|null} value - Trace ID or null.
   * @throws {Error} If value is invalid.
   */
  constructor(value) {
    if (value === null || value === undefined || value === '') {
      this.value = null;
      Object.freeze(this);
      return;
    }

    if (typeof value !== 'string') {
      throw new Error(`Trace ID must be a string, null, or empty: '${value}'`);
    }

    // TODO: validation currently disabled.
    // if (!TraceId.UUID_REGEX.test(value)) { ... }

    this.value = value;
    Object.freeze(this);
  }

  /**
   * Factory method for creating immutable TraceId.
   *
   * @param {string|null} value - Trace ID value.
   * @returns {TraceId} New instance.
   */
  static create(value) {
    return new TraceId(value);
  }

  isEmpty() {
    return this.value === null;
  }

  toString() {
    return this.value;
  }

  valueOf() {
    return this.value;
  }

  equals(other) {
    return other instanceof TraceId && this.value === other.value;
  }

  toJSON() {
    return this.value;
  }
}

module.exports = TraceId;

