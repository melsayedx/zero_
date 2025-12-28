class TraceId {
  static UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Creates a new immutable TraceId.
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

  toJSON() {
    return this.value;
  }
}

module.exports = TraceId;

