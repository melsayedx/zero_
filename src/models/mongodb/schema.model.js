/**
 * Schema Model
 * Manages log schema registry for validation and documentation
 */

const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'date', 'object', 'array'],
    required: true
  },
  
  required: {
    type: Boolean,
    default: false
  },
  
  description: String,
  
  validation: {
    min: Number,
    max: Number,
    pattern: String,
    enum: [String]
  },
  
  indexed: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const schemaRegistrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  
  version: {
    type: String,
    required: true,
    default: '1.0.0'
  },
  
  description: {
    type: String,
    maxlength: 1000
  },
  
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Schema definition
  fields: [fieldSchema],
  
  // Base schema fields (timestamp, level, message, etc.)
  baseSchema: {
    type: String,
    enum: ['default', 'opentelemetry', 'custom'],
    default: 'default'
  },
  
  // Service association
  services: [String],
  
  // Transformation rules
  transformations: [{
    field: String,
    operation: {
      type: String,
      enum: ['rename', 'cast', 'extract', 'format']
    },
    config: Object
  }],
  
  // Validation settings
  validation: {
    strict: {
      type: Boolean,
      default: false
    },
    allowAdditionalFields: {
      type: Boolean,
      default: true
    }
  },
  
  // Schema status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Usage statistics
  stats: {
    logsProcessed: {
      type: Number,
      default: 0
    },
    validationErrors: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  },
  
  // Schema examples
  examples: [{
    name: String,
    description: String,
    data: Object
  }],
  
  tags: [String]
}, {
  timestamps: true
});

// Indexes
schemaRegistrySchema.index({ name: 1, version: 1 }, { unique: true });
schemaRegistrySchema.index({ owner: 1 });
schemaRegistrySchema.index({ services: 1 });
schemaRegistrySchema.index({ isActive: 1 });

// Validate log against schema
schemaRegistrySchema.methods.validateLog = function(logData) {
  const errors = [];
  
  // Check required fields
  for (const field of this.fields) {
    if (field.required && !logData[field.name]) {
      errors.push(`Missing required field: ${field.name}`);
    }
    
    // Type validation
    if (logData[field.name] !== undefined) {
      const actualType = typeof logData[field.name];
      const expectedType = field.type;
      
      if (expectedType === 'date' && !(logData[field.name] instanceof Date)) {
        errors.push(`Field ${field.name} should be a date`);
      } else if (expectedType !== 'date' && actualType !== expectedType) {
        errors.push(`Field ${field.name} should be ${expectedType}, got ${actualType}`);
      }
      
      // Validation rules
      if (field.validation) {
        if (field.validation.enum && !field.validation.enum.includes(logData[field.name])) {
          errors.push(`Field ${field.name} must be one of: ${field.validation.enum.join(', ')}`);
        }
        
        if (field.validation.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(logData[field.name])) {
            errors.push(`Field ${field.name} does not match pattern: ${field.validation.pattern}`);
          }
        }
        
        if (field.validation.min !== undefined && logData[field.name] < field.validation.min) {
          errors.push(`Field ${field.name} must be >= ${field.validation.min}`);
        }
        
        if (field.validation.max !== undefined && logData[field.name] > field.validation.max) {
          errors.push(`Field ${field.name} must be <= ${field.validation.max}`);
        }
      }
    }
  }
  
  // Check for additional fields if strict mode
  if (this.validation.strict && !this.validation.allowAdditionalFields) {
    const schemaFields = this.fields.map(f => f.name);
    const additionalFields = Object.keys(logData).filter(k => !schemaFields.includes(k));
    
    if (additionalFields.length > 0) {
      errors.push(`Additional fields not allowed: ${additionalFields.join(', ')}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Update usage statistics
schemaRegistrySchema.methods.updateStats = async function(logsCount, errorsCount = 0) {
  this.stats.logsProcessed += logsCount;
  this.stats.validationErrors += errorsCount;
  this.stats.lastUsed = new Date();
  await this.save();
};

// Get schema as JSON Schema format
schemaRegistrySchema.methods.toJSONSchema = function() {
  const properties = {};
  const required = [];
  
  for (const field of this.fields) {
    properties[field.name] = {
      type: field.type,
      description: field.description
    };
    
    if (field.validation) {
      Object.assign(properties[field.name], field.validation);
    }
    
    if (field.required) {
      required.push(field.name);
    }
  }
  
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required,
    additionalProperties: this.validation.allowAdditionalFields
  };
};

module.exports = mongoose.model('Schema', schemaRegistrySchema);

