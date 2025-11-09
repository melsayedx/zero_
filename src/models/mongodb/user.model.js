/**
 * User Model
 * Manages user authentication and authorization
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  
  role: {
    type: String,
    enum: ['admin', 'user', 'viewer'],
    default: 'user'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  apiKeys: [{
    key: String,
    name: String,
    createdAt: Date,
    lastUsed: Date
  }],
  
  preferences: {
    defaultDashboard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dashboard'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },
  
  metadata: {
    lastLogin: Date,
    loginCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'apiKeys.key': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.apiKeys;
  return obj;
};

// Generate API key
userSchema.methods.generateApiKey = function(name = 'Default') {
  const crypto = require('crypto');
  const key = crypto.randomBytes(32).toString('hex');
  
  this.apiKeys.push({
    key,
    name,
    createdAt: new Date(),
    lastUsed: null
  });
  
  return key;
};

module.exports = mongoose.model('User', userSchema);

