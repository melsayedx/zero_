/** Immutable metadata container with cached JSON serialization. */
class Metadata {
  static MAX_SIZE_BYTES = 16384; // 16KB

  /**
   * Creates new Metadata.
   * @param {Object} [metadata={}] - Metadata object.
   * @throws {Error} If invalid type.
   */
  constructor(metadata = {}) {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      throw new Error('Metadata must be an object');
    }

    this.object = { ...metadata }; // Shallow copy
    this._stringified = null;
    this._sizeBytes = null; // Size cache

    Object.freeze(this.object);
    // Object not frozen to allow lazy caching
  }



  /**
   * Returns cached JSON string.
   * @returns {string} JSON string.
   * @throws {Error} If serializing fails or too large.
   */
  get string() {
    if (this._stringified === null) {
      try {
        this._stringified = JSON.stringify(this.object);
      } catch (error) {
        throw new Error('Metadata must be JSON-serializable');
      }

      // Cache size.
      this._sizeBytes = Buffer.byteLength(this._stringified, 'utf8');

      if (this._sizeBytes > Metadata.MAX_SIZE_BYTES) {
        throw new Error(`Metadata exceeds size limit of ${Metadata.MAX_SIZE_BYTES} bytes`);
      }
    }

    return this._stringified;
  }

  /**
   * Returns metadata object.
   * @returns {Object} Immutable object.
   */
  get value() {
    return this.object;
  }

  toJSON() {
    return this.object;
  }

}

module.exports = Metadata;

