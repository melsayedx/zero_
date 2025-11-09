/**
 * Alert Model
 * Manages alerting rules and notifications
 */

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    maxlength: 500
  },
  
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Alert condition
  condition: {
    metric: {
      type: String,
      required: true,
      enum: ['log_count', 'error_rate', 'custom_query']
    },
    
    operator: {
      type: String,
      required: true,
      enum: ['>', '<', '>=', '<=', '==', '!=']
    },
    
    threshold: {
      type: Number,
      required: true
    },
    
    timeWindow: {
      type: Number,
      required: true,
      default: 300 // seconds
    },
    
    filters: {
      services: [String],
      levels: [String],
      environments: [String],
      customQuery: String
    }
  },
  
  // Notification settings
  notifications: [{
    type: {
      type: String,
      enum: ['email', 'slack', 'webhook', 'pagerduty'],
      required: true
    },
    
    config: {
      type: Object,
      required: true
    },
    
    enabled: {
      type: Boolean,
      default: true
    }
  }],
  
  // Alert state
  isEnabled: {
    type: Boolean,
    default: true
  },
  
  severity: {
    type: String,
    enum: ['critical', 'warning', 'info'],
    default: 'warning'
  },
  
  // Throttling
  throttle: {
    enabled: {
      type: Boolean,
      default: true
    },
    intervalSeconds: {
      type: Number,
      default: 300
    }
  },
  
  // Alert history
  lastTriggered: Date,
  
  triggerCount: {
    type: Number,
    default: 0
  },
  
  lastValue: Number,
  
  // Metadata
  tags: [String]
}, {
  timestamps: true
});

// Indexes
alertSchema.index({ owner: 1, createdAt: -1 });
alertSchema.index({ isEnabled: 1 });
alertSchema.index({ 'condition.metric': 1 });
alertSchema.index({ lastTriggered: -1 });

// Trigger alert
alertSchema.methods.trigger = async function(value) {
  this.lastTriggered = new Date();
  this.triggerCount++;
  this.lastValue = value;
  await this.save();
  
  return {
    alertId: this._id,
    name: this.name,
    severity: this.severity,
    value,
    threshold: this.condition.threshold,
    timestamp: this.lastTriggered
  };
};

// Check if alert should be throttled
alertSchema.methods.shouldThrottle = function() {
  if (!this.throttle.enabled || !this.lastTriggered) {
    return false;
  }
  
  const timeSinceLastTrigger = Date.now() - this.lastTriggered.getTime();
  const throttleMs = this.throttle.intervalSeconds * 1000;
  
  return timeSinceLastTrigger < throttleMs;
};

// Evaluate condition
alertSchema.methods.evaluateCondition = function(currentValue) {
  const { operator, threshold } = this.condition;
  
  switch (operator) {
    case '>':
      return currentValue > threshold;
    case '<':
      return currentValue < threshold;
    case '>=':
      return currentValue >= threshold;
    case '<=':
      return currentValue <= threshold;
    case '==':
      return currentValue === threshold;
    case '!=':
      return currentValue !== threshold;
    default:
      return false;
  }
};

module.exports = mongoose.model('Alert', alertSchema);

