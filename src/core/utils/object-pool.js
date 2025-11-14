/**
 * Generic Object Pool - Reduces GC pressure by reusing objects
 * 
 * Benefits:
 * - Reduces memory allocations
 * - Decreases GC pause times
 * - Improves throughput for high-frequency object creation
 * 
 * Usage:
 * const pool = new ObjectPool(
 *   () => ({ id: '', data: '' }),  // factory
 *   (obj) => { obj.id = ''; obj.data = ''; }  // reset
 * );
 * 
 * const obj = pool.acquire();
 * obj.id = '123';
 * pool.release(obj);
 */

class ObjectPool {
  constructor(factory, reset, options = {}) {
    this.factory = factory;
    this.reset = reset;
    
    // Configuration
    this.initialSize = options.initialSize || 1000;
    this.maxSize = options.maxSize || 10000;
    this.warningThreshold = options.warningThreshold || 0.9; // Warn at 90% capacity
    
    // Pool state
    this.pool = [];
    this.created = 0;
    this.hits = 0;
    this.misses = 0;
    this.released = 0;
    
    // Pre-allocate objects
    this.preallocate();
    
    console.log(`[ObjectPool] Initialized with ${this.pool.length} pre-allocated objects (max: ${this.maxSize})`);
  }
  
  /**
   * Pre-allocate initial objects
   */
  preallocate() {
    for (let i = 0; i < this.initialSize; i++) {
      this.pool.push(this.factory());
      this.created++;
    }
  }
  
  /**
   * Acquire an object from the pool
   * @returns {Object} Pooled object
   */
  acquire() {
    if (this.pool.length > 0) {
      this.hits++;
      return this.pool.pop();
    }
    
    // Pool is empty, create new object
    this.misses++;
    this.created++;
    
    // Warn if we're creating too many objects
    if (this.created >= this.maxSize * this.warningThreshold) {
      console.warn(`[ObjectPool] Warning: Created ${this.created} objects (max: ${this.maxSize}). Consider increasing pool size.`);
    }
    
    return this.factory();
  }
  
  /**
   * Release an object back to the pool
   * @param {Object} obj - Object to return to pool
   */
  release(obj) {
    if (!obj) return;
    
    // Don't exceed max pool size
    if (this.pool.length >= this.maxSize) {
      return; // Let GC handle it
    }
    
    // Reset object state
    try {
      this.reset(obj);
      this.pool.push(obj);
      this.released++;
    } catch (error) {
      console.error('[ObjectPool] Error resetting object:', error);
      // Don't add back to pool if reset fails
    }
  }
  
  /**
   * Release multiple objects at once
   * @param {Array<Object>} objects - Array of objects to return to pool
   */
  releaseMany(objects) {
    if (!Array.isArray(objects)) return;
    
    for (const obj of objects) {
      this.release(obj);
    }
  }
  
  /**
   * Get pool statistics
   * @returns {Object} Pool metrics
   */
  getStats() {
    const hitRate = this.hits + this.misses > 0 
      ? (this.hits / (this.hits + this.misses) * 100).toFixed(2)
      : 0;
    
    return {
      available: this.pool.length,
      created: this.created,
      hits: this.hits,
      misses: this.misses,
      released: this.released,
      hitRate: `${hitRate}%`,
      maxSize: this.maxSize
    };
  }
  
  /**
   * Clear the pool (useful for testing)
   */
  clear() {
    this.pool = [];
    this.hits = 0;
    this.misses = 0;
    this.released = 0;
  }
  
  /**
   * Shrink pool to target size
   * @param {number} targetSize - Desired pool size
   */
  shrink(targetSize = null) {
    const target = targetSize || this.initialSize;
    
    if (this.pool.length > target) {
      const removed = this.pool.length - target;
      this.pool.length = target;
      console.log(`[ObjectPool] Shrunk pool by ${removed} objects`);
    }
  }
}

module.exports = ObjectPool;

