/**
 * Dashboard Model
 * Manages dashboard configurations and visualizations
 */

const mongoose = require('mongoose');

const widgetSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  
  type: {
    type: String,
    enum: ['chart', 'table', 'counter', 'graph', 'heatmap', 'text'],
    required: true
  },
  
  title: {
    type: String,
    required: true
  },
  
  query: {
    type: Object,
    required: true
  },
  
  visualization: {
    chartType: String, // line, bar, pie, area, etc.
    xAxis: String,
    yAxis: String,
    groupBy: [String],
    aggregation: String // count, sum, avg, min, max
  },
  
  position: {
    x: Number,
    y: Number,
    width: Number,
    height: Number
  },
  
  refreshInterval: {
    type: Number,
    default: 60000 // milliseconds
  }
}, { _id: false });

const dashboardSchema = new mongoose.Schema({
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
  
  widgets: [widgetSchema],
  
  layout: {
    type: String,
    enum: ['grid', 'flex', 'custom'],
    default: 'grid'
  },
  
  timeRange: {
    type: String,
    enum: ['15m', '1h', '6h', '24h', '7d', '30d', 'custom'],
    default: '24h'
  },
  
  customTimeRange: {
    start: Date,
    end: Date
  },
  
  filters: {
    services: [String],
    levels: [String],
    environments: [String]
  },
  
  isPublic: {
    type: Boolean,
    default: false
  },
  
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    }
  }],
  
  tags: [String],
  
  metadata: {
    viewCount: {
      type: Number,
      default: 0
    },
    lastViewed: Date
  }
}, {
  timestamps: true
});

// Indexes
dashboardSchema.index({ owner: 1, createdAt: -1 });
dashboardSchema.index({ name: 'text', description: 'text' });
dashboardSchema.index({ tags: 1 });
dashboardSchema.index({ isPublic: 1 });

// Increment view count
dashboardSchema.methods.incrementViewCount = function() {
  this.metadata.viewCount++;
  this.metadata.lastViewed = new Date();
  return this.save();
};

// Add widget
dashboardSchema.methods.addWidget = function(widget) {
  this.widgets.push(widget);
  return this.save();
};

// Remove widget
dashboardSchema.methods.removeWidget = function(widgetId) {
  this.widgets = this.widgets.filter(w => w.id !== widgetId);
  return this.save();
};

// Update widget
dashboardSchema.methods.updateWidget = function(widgetId, updates) {
  const widget = this.widgets.find(w => w.id === widgetId);
  if (widget) {
    Object.assign(widget, updates);
    return this.save();
  }
  throw new Error('Widget not found');
};

module.exports = mongoose.model('Dashboard', dashboardSchema);

