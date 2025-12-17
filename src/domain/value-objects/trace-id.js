/**
 * TraceId Value Object - Immutable trace identifier representation.
 *
 * This class provides an immutable container for trace identifiers with built-in
 * validation and optional UUID format checking. It supports both valid trace IDs
 * and null/empty values for cases where tracing is not available.
 *
 * Key features:
 * - Immutable trace ID storage
 * - Optional UUID v1-v7 format validation
 * - Support for null/empty trace IDs
 * - Consistent value object interface
 *
 * @example
 * ```javascript
 * // Create with valid trace ID
 * const traceId = new TraceId('12345678-1234-1234-1234-123456789abc');
 * logger.info(traceId.value); // '12345678-1234-1234-1234-123456789abc'
 *
 * // Create with null (tracing not available)
 * const emptyTrace = new TraceId(null);
 * logger.info(emptyTrace.isEmpty()); // true
 *
 * // Using factory method
 * const trace = TraceId.create('some-trace-id');
 * ```
 */
class TraceId {
  /**
   * Regular expression for UUID v1-v7 format validation.
   * Currently disabled in favor of accepting any string trace ID.
   * @type {RegExp}
   * @private
   */
  static UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * Create a new TraceId instance.
   *
   * Accepts string trace identifiers or null/empty values. Currently accepts any
   * string value (UUID v1-v7 validation is available but disabled). Null, undefined,
   * and empty string values are normalized to null to indicate no tracing.
   *
   * @param {string|null|undefined} value - Trace identifier or null for no tracing
   * @throws {Error} If value is not a string (when UUID validation is enabled)
   *
   * @example
   * ```javascript
   * // Valid string trace ID
   * const trace = new TraceId('abc-123-def');
   *
   * // No tracing available
   * const noTrace = new TraceId(null);
   * const emptyTrace = new TraceId('');
   *
   * // Both result in isEmpty() === true
   * logger.info(noTrace.isEmpty()); // true
   * ```
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

    // UUID validation currently disabled - accepts any string
    // if (!TraceId.UUID_REGEX.test(value)) {
    //   throw new Error(`Trace ID must be a valid UUID format: '${value}'`);
    // }

    this.value = value;
    Object.freeze(this);
  }

  /**
   * Factory method to create a TraceId instance.
   *
   * Provides a consistent interface for creating TraceId instances across the
   * application. While currently just delegates to the constructor, this method
   * allows for future enhancements like instance caching, validation customization,
   * or alternative creation strategies without breaking existing code.
   *
   * Benefits of factory method pattern:
   * - Consistent creation interface across value objects
   * - Enables future caching or pooling optimizations
   * - Allows validation customization per use case
   * - Self-documenting creation method
   *
   * @param {string|null|undefined} value - Trace identifier value
   * @returns {TraceId} New TraceId instance
   *
   * @example
   * ```javascript
   * // Preferred factory method usage
   * const traceId = TraceId.create('request-123');
   *
   * // Equivalent to constructor (but future-proof)
   * const sameTraceId = new TraceId('request-123');
   * ```
   */
  static create(value) {
    return new TraceId(value);
  }

  /**
   * Check if this TraceId represents no tracing context.
   *
   * Returns true when the trace ID is null, indicating that no trace context
   * is available for this operation. This is useful for conditional tracing logic.
   *
   * @returns {boolean} True if trace ID is null (no tracing)
   *
   * @example
   * ```javascript
   * const traceId = new TraceId(null);
   * if (traceId.isEmpty()) {
   *   logger.info('No trace context available');
   * }
   * ```
   */
  isEmpty() {
    return this.value === null;
  }

  /**
   * Get string representation of the trace ID.
   *
   * Returns the trace ID string or null. This method is called implicitly
   * when the object is converted to a string.
   *
   * @returns {string|null} The trace ID string or null
   *
   * @example
   * ```javascript
   * const traceId = new TraceId('abc-123');
   * logger.info(`Trace: ${traceId}`); // Implicit toString()
   * logger.info(traceId.toString());  // Explicit call
   * ```
   */
  toString() {
    return this.value;
  }

  /**
   * Get the primitive value for mathematical operations and comparisons.
   *
   * Returns the underlying value for use in primitive contexts. While not
   * currently used in this codebase, this method provides:
   * - Implicit conversion in mathematical operations
   * - Consistent primitive value access across value objects
   * - Future compatibility with numeric trace IDs
   * - Standardized value extraction interface
   *
   * @returns {string|null} The primitive trace ID value
   *
   * @example
   * ```javascript
   * const traceId = new TraceId('trace-123');
   *
   * // Potential future usage
   * const primitive = traceId.valueOf(); // 'trace-123'
   * const concatenated = traceId + '-suffix'; // Implicit conversion
   * ```
   */
  valueOf() {
    return this.value;
  }

  /**
   * Check equality with another TraceId instance.
   *
   * Performs identity comparison based on the trace ID value.
   * Null values are considered equal to other null values.
   *
   * @param {*} other - Value to compare with this TraceId
   * @returns {boolean} True if other is a TraceId with identical value
   *
   * @example
   * ```javascript
   * const trace1 = new TraceId('abc-123');
   * const trace2 = new TraceId('abc-123');
   * const trace3 = new TraceId('different');
   *
   * trace1.equals(trace2); // true (same value)
   * trace1.equals(trace3); // false (different value)
   * ```
   */
  equals(other) {
    return other instanceof TraceId && this.value === other.value;
  }

  /**
   * Get JSON representation for serialization.
   *
   * Returns the primitive value for JSON serialization. This method is
   * automatically called by JSON.stringify() and ensures proper serialization
   * of TraceId instances in JSON output.
   *
   * Benefits even when not explicitly used:
   * - Automatic JSON serialization support
   * - Consistent serialization across environments
   * - Prevents circular reference issues
   * - Enables TraceId in JSON.stringify() contexts
   *
   * @returns {string|null} The trace ID value for JSON serialization
   *
   * @example
   * ```javascript
   * const traceId = new TraceId('trace-123');
   *
   * // Automatic JSON serialization
   * JSON.stringify({ trace: traceId }); // '{"trace":"trace-123"}'
   *
   * // Manual serialization
   * const jsonValue = traceId.toJSON(); // 'trace-123'
   * ```
   */
  toJSON() {
    return this.value;
  }
}

/**
 * @typedef {TraceId} TraceId
 * @property {string|null} value - The trace identifier string or null
 */

module.exports = TraceId;

