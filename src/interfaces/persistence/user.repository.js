const mongoose = require('mongoose');
const UserRepositoryContract = require('../../domain/contracts/user-repository.contract');

/**
 * Mongoose Schema for User
 */
const userSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254
  },
  password_hash: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  collection: 'users',
  timestamps: false // We're managing created_at manually
});



/**
 * User Repository Implementation using MongoDB (Mongoose)
 * Implements UserRepositoryPort interface
 */
class UserRepository extends UserRepositoryContract {
  constructor() {
    super();
    this.model = mongoose.model('User', userSchema);
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user object
   * @throws {Error} If user creation fails
   */
  async create(userData) {
    try {
      const user = new this.model(userData);
      const savedUser = await user.save();
      return this._toPlainObject(savedUser);
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        throw new Error(`User with this ${field} already exists`);
      }
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Find a user by email address
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findByEmail(email) {
    try {
      const user = await this.model.findOne({ email: email.toLowerCase() }).lean();
      return user;
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  /**
   * Find a user by user_id
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findByUserId(userId) {
    try {
      const user = await this.model.findOne({ user_id: userId }).lean();
      return user;
    } catch (error) {
      throw new Error(`Failed to find user by ID: ${error.message}`);
    }
  }

  /**
   * Check if a user exists by email
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if user exists
   */
  async existsByEmail(email) {
    try {
      const count = await this.model.countDocuments({ email: email.toLowerCase() });
      return count > 0;
    } catch (error) {
      throw new Error(`Failed to check user existence: ${error.message}`);
    }
  }

  /**
   * Update user data
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async update(userId, updates) {
    try {
      const user = await this.model.findOneAndUpdate(
        { user_id: userId },
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
      return user;
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Delete a user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user was deleted
   */
  async delete(userId) {
    try {
      const result = await this.model.deleteOne({ user_id: userId });
      return result.deletedCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Convert Mongoose document to plain object
   * @private
   */
  _toPlainObject(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    // Remove MongoDB _id and __v fields
    delete obj._id;
    delete obj.__v;
    return obj;
  }
}

module.exports = UserRepository;

