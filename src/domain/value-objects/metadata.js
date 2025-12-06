/**
 * Metadata Value Object - Immutable metadata container with JSON serialization caching.
 *
 * This class provides an immutable container for metadata objects with built-in
 * validation, size limits, and optimized JSON serialization. It uses lazy evaluation
 * and caching to improve performance for repeated serialization operations.
 *
 * Key features:
 * - Immutable metadata storage with defensive copying
 * - Lazy JSON serialization with caching
 * - Size validation (16KB limit)
 * - Memory-efficient equality comparisons
 *
 * @example
 * ```javascript
 * // Create metadata instance
 * const metadata = new Metadata({ userId: 123, action: 'login' });
 *
 * // Access original object (immutable)
 * console.log(metadata.value); // { userId: 123, action: 'login' }
 *
 * // Get JSON string (lazy, cached)
 * console.log(metadata.string); // '{"userId":123,"action":"login"}'
 *
 * // Check size
 * console.log(metadata.getSize()); // Size in bytes
 *
 * // Equality comparison
 * const other = new Metadata({ userId: 123, action: 'login' });
 * console.log(metadata.equals(other)); // true
 * ```
 */
class Metadata {
  /**
   * Maximum allowed size for metadata JSON serialization in bytes.
   * @type {number}
   */
  static MAX_SIZE_BYTES = 16384; // 16KB

  /**
   * Create a new Metadata instance.
   *
   * Performs validation on the input metadata and creates an immutable container.
   * The metadata object is defensively copied and frozen to prevent external mutation.
   * JSON serialization is performed lazily on first access.
   *
   * @param {Object} [metadata={}] - The metadata object to store
   * @throws {Error} If metadata is not a plain object or is null/array
   *
   * @example
   * ```javascript
   * // Valid usage
   * const meta = new Metadata({ userId: 123, event: 'click' });
   *
   * // Invalid usage - these will throw
   * // new Metadata(null);     // Error: must be object
   * // new Metadata([1, 2]);   // Error: cannot be array
   * // new Metadata('string'); // Error: must be object
   * ```
   */
  /**
   * Factory method to create a Metadata instance.
   *
   * Provides a consistent interface for creating Metadata instances across the application.
   * Allows for future enhancements like validation customization or caching strategies.
   *
   * @param {Object} [metadata={}] - The metadata object to store
   * @returns {Metadata} New Metadata instance
   *
   * @example
   * ```javascript
   * // Standard usage
   * const metadata = Metadata.create({ userId: 123, action: 'login' });
   *
   * // Equivalent to constructor
   * const sameMetadata = new Metadata({ userId: 123, action: 'login' });
   * ```
   */
  static create(metadata = {}) {
    return new Metadata(metadata);
  }

  constructor(metadata = {}) {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error('Metadata must be an object');
    }

    this.object = { ...metadata }; // Create a shallow copy
    this._stringified = null;
    this._sizeBytes = null; // Cache size alongside string

    Object.freeze(this.object);
    // Don't freeze this object since we need to set _stringified and _sizeBytes
  }

  /**
   * Get the JSON string representation with caching.
   *
   * Returns the JSON serialization of the metadata object. The first call performs
   * the serialization and caches the result. Subsequent calls return the cached value.
   * Also validates size limits on first access.
   *
   * @returns {string} JSON string representation of the metadata
   * @throws {Error} If metadata is not JSON-serializable or exceeds size limit
   *
   * @example
   * ```javascript
   * const meta = new Metadata({ key: 'value' });
   *
   * // First access - performs serialization
   * const json1 = meta.string; // '{"key":"value"}'
   *
   * // Subsequent access - returns cached value
   * const json2 = meta.string; // Same result, instant
   * ```
   */
  get string() {
    if (this._stringified === null) {
      try {
        this._stringified = JSON.stringify(this.object);
      } catch (error) {
        throw new Error('Metadata must be JSON-serializable');
      }

      // Cache size alongside string (computed once)
      this._sizeBytes = Buffer.byteLength(this._stringified, 'utf8');

      // Check size limit
      if (this._sizeBytes > Metadata.MAX_SIZE_BYTES) {
        throw new Error(`Metadata exceeds size limit of ${Metadata.MAX_SIZE_BYTES} bytes`);
      }
    }

    return this._stringified;
  }

  /**
   * Get the metadata object.
   *
   * Returns the original metadata object. The returned object is frozen to prevent
   * external modification, ensuring immutability.
   *
   * @returns {Object} The immutable metadata object
   *
   * @example
   * ```javascript
   * const original = { userId: 123, action: 'login' };
   * const meta = new Metadata(original);
   *
   * console.log(meta.value); // { userId: 123, action: 'login' }
   * console.log(Object.isFrozen(meta.value)); // true
   * ```
   */
  get value() {
    return this.object;
  }

  /**
   * Check if metadata is empty.
   *
   * Determines whether the metadata object contains any properties.
   * This is a fast O(1) check that doesn't trigger JSON serialization.
   *
   * @returns {boolean} True if the metadata object has no properties
   *
   * @example
   * ```javascript
   * new Metadata({}).isEmpty();        // true
   * new Metadata({ key: 'value' }).isEmpty(); // false
   * ```
   */
  isEmpty() {
    return Object.keys(this.object).length === 0;
  }

  /**
   * Get metadata size in bytes with caching.
   *
   * Returns the size of the JSON serialization in bytes. The size is computed
   * alongside the JSON string on first access and cached for subsequent calls.
   *
   * @returns {number} Size in bytes of the JSON representation
   *
   * @example
   * ```javascript
   * const meta = new Metadata({ message: 'hello' });
   * console.log(meta.getSize()); // Size in bytes (e.g., 18)
   * ```
   */
  getSize() {
    // Trigger lazy evaluation if not yet computed
    if (this._sizeBytes === null) {
      // Access string getter to compute and cache size
      const _ = this.string;
    }
    return this._sizeBytes;
  }

  /**
   * Get string representation of the metadata.
   *
   * Returns the JSON string representation. This method is called implicitly
   * when the object is converted to a string (e.g., in template literals).
   *
   * @returns {string} JSON string representation
   *
   * @example
   * ```javascript
   * const meta = new Metadata({ key: 'value' });
   * console.log(`Metadata: ${meta}`); // Implicit toString() call
   * ```
   */
  toString() {
    return this.string;
  }

  /**
   * Get JSON representation for serialization.
   *
   * Returns the original metadata object for JSON serialization.
   * This method is called by JSON.stringify().
   *
   * @returns {Object} The metadata object for JSON serialization
   *
   * @example
   * ```javascript
   * const meta = new Metadata({ key: 'value' });
   * JSON.stringify(meta); // '{"key":"value"}'
   * ```
   */
  toJSON() {
    return this.object;
  }

  /**
   * Check equality with another Metadata instance.
   *
   * Performs deep equality comparison by comparing JSON representations.
   * Uses optimized comparison when both instances have cached JSON strings.
   * Falls back to lazy evaluation if strings aren't cached yet.
   *
   * @param {*} other - Value to compare with this Metadata instance
   * @returns {boolean} True if other is a Metadata instance with identical content
   *
   * @example
   * ```javascript
   * const meta1 = new Metadata({ key: 'value', order: [1, 2] });
   * const meta2 = new Metadata({ key: 'value', order: [1, 2] });
   * const meta3 = new Metadata({ key: 'different' });
   *
   * meta1.equals(meta2); // true (same content)
   * meta1.equals(meta3); // false (different content)
   * meta1.equals({});    // false (not a Metadata instance)
   * ```
   *
   * @performance Uses cached JSON strings when available for fast comparison.
   * Falls back to lazy evaluation for uncached instances.
   */
  equals(other) {
    if (!(other instanceof Metadata)) {
      return false;
    }

    // Fast path: if both strings are already computed and cached, compare directly
    if (this._stringified !== null && other._stringified !== null) {
      return this._stringified === other._stringified;
    }

    // Fallback: use string getter (which handles lazy evaluation and error cases)
    try {
      return this.string === other.string;
    } catch {
      return false;
    }
  }
}

module.exports = Metadata;

