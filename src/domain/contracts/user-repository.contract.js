/**
 * User Repository Contract (Interface)
 * Defines the contract for user data persistence
 * 
 * In onion architecture, this is a domain contract that defines what the domain needs.
 * Concrete implementations (like MongoDBUserRepository) in the interfaces layer will implement this contract.
 */
class UserRepositoryContract {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.user_id - Unique user identifier
   * @param {string} userData.email - User email
   * @param {string} userData.password_hash - Hashed password
   * @returns {Promise<Object>} Created user object
   * @throws {Error} If user creation fails
   */
  async create(userData) {
    throw new Error('Method not implemented: create');
  }

  /**
   * Find a user by email address
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   * @throws {Error} If query fails
   */
  async findByEmail(email) {
    throw new Error('Method not implemented: findByEmail');
  }

  /**
   * Find a user by user_id
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   * @throws {Error} If query fails
   */
  async findByUserId(userId) {
    throw new Error('Method not implemented: findByUserId');
  }

  /**
   * Check if a user exists by email
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if user exists
   * @throws {Error} If query fails
   */
  async existsByEmail(email) {
    throw new Error('Method not implemented: existsByEmail');
  }

  /**
   * Update user data
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated user object or null if not found
   * @throws {Error} If update fails
   */
  async update(userId, updates) {
    throw new Error('Method not implemented: update');
  }

  /**
   * Delete a user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user was deleted
   * @throws {Error} If deletion fails
   */
  async delete(userId) {
    throw new Error('Method not implemented: delete');
  }
}

module.exports = UserRepositoryContract;

