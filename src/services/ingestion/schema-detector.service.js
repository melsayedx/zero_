/**
 * Schema Detector Service
 * Automatically detects log schema from ingested data
 */

const logger = require('../../utils/logger');

class SchemaDetectorService {
  /**
   * Detect schema from log samples
   * @param {Array} logs - Sample logs
   * @param {string} serviceName - Service name
   * @returns {Object} Detected schema
   */
  detectSchema(logs, serviceName) {
    try {
      if (!logs || logs.length === 0) {
        throw new Error('No logs provided for schema detection');
      }

      const schema = {
        service: serviceName,
        fields: {},
        sampleCount: logs.length,
        confidence: 0
      };

      // Analyze each log entry
      logs.forEach(log => {
        this.analyzeFields(log, schema.fields);
      });

      // Calculate confidence based on consistency
      schema.confidence = this.calculateConfidence(schema.fields, logs.length);

      // Generate field definitions
      schema.fieldDefinitions = this.generateFieldDefinitions(schema.fields);

      logger.info('Schema detected', {
        service: serviceName,
        fieldCount: Object.keys(schema.fields).length,
        confidence: schema.confidence
      });

      return schema;
    } catch (error) {
      logger.error('Schema detection error', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze fields in log entry
   * @param {Object} log - Log entry
   * @param {Object} fields - Fields accumulator
   * @param {string} prefix - Field prefix for nested objects
   */
  analyzeFields(log, fields, prefix = '') {
    for (const [key, value] of Object.entries(log)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      
      if (!fields[fieldName]) {
        fields[fieldName] = {
          type: this.detectType(value),
          occurrences: 0,
          nullCount: 0,
          examples: []
        };
      }

      fields[fieldName].occurrences++;

      if (value === null || value === undefined) {
        fields[fieldName].nullCount++;
      } else {
        // Store unique examples (up to 3)
        if (fields[fieldName].examples.length < 3 && 
            !fields[fieldName].examples.includes(value)) {
          fields[fieldName].examples.push(value);
        }

        // Handle nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          this.analyzeFields(value, fields, fieldName);
        }
      }
    }
  }

  /**
   * Detect field type
   * @param {any} value - Field value
   * @returns {string} Detected type
   */
  detectType(value) {
    if (value === null || value === undefined) {
      return 'unknown';
    }

    if (Array.isArray(value)) {
      return 'array';
    }

    if (value instanceof Date) {
      return 'date';
    }

    const type = typeof value;

    if (type === 'object') {
      return 'object';
    }

    if (type === 'string') {
      // Try to detect special string types
      if (this.isISO8601(value)) {
        return 'date';
      }
      if (this.isEmail(value)) {
        return 'email';
      }
      if (this.isURL(value)) {
        return 'url';
      }
      return 'string';
    }

    return type;
  }

  /**
   * Check if string is ISO8601 date
   * @param {string} str - String to check
   * @returns {boolean}
   */
  isISO8601(str) {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    return iso8601Regex.test(str);
  }

  /**
   * Check if string is email
   * @param {string} str - String to check
   * @returns {boolean}
   */
  isEmail(str) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
  }

  /**
   * Check if string is URL
   * @param {string} str - String to check
   * @returns {boolean}
   */
  isURL(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate schema confidence
   * @param {Object} fields - Analyzed fields
   * @param {number} totalLogs - Total log count
   * @returns {number} Confidence score (0-100)
   */
  calculateConfidence(fields, totalLogs) {
    let totalConfidence = 0;
    const fieldCount = Object.keys(fields).length;

    if (fieldCount === 0) {
      return 0;
    }

    for (const field of Object.values(fields)) {
      // Field is more confident if it appears in all logs
      const occurrenceRate = field.occurrences / totalLogs;
      
      // Field is more confident if it's rarely null
      const nonNullRate = field.nullCount > 0
        ? 1 - (field.nullCount / field.occurrences)
        : 1;

      const fieldConfidence = (occurrenceRate * 0.7) + (nonNullRate * 0.3);
      totalConfidence += fieldConfidence;
    }

    return Math.round((totalConfidence / fieldCount) * 100);
  }

  /**
   * Generate field definitions for schema registry
   * @param {Object} fields - Analyzed fields
   * @returns {Array} Field definitions
   */
  generateFieldDefinitions(fields) {
    return Object.entries(fields).map(([name, info]) => ({
      name,
      type: info.type,
      required: info.occurrences > 0 && info.nullCount === 0,
      description: `Auto-detected field (${info.occurrences} occurrences)`,
      examples: info.examples
    }));
  }

  /**
   * Compare detected schema with registered schema
   * @param {Object} detectedSchema - Detected schema
   * @param {Object} registeredSchema - Registered schema
   * @returns {Object} Comparison result
   */
  compareSchemas(detectedSchema, registeredSchema) {
    const differences = {
      missingFields: [],
      extraFields: [],
      typeMismatches: []
    };

    const detectedFields = new Set(Object.keys(detectedSchema.fields));
    const registeredFields = new Set(registeredSchema.fields.map(f => f.name));

    // Find missing fields
    for (const field of registeredFields) {
      if (!detectedFields.has(field)) {
        differences.missingFields.push(field);
      }
    }

    // Find extra fields
    for (const field of detectedFields) {
      if (!registeredFields.has(field)) {
        differences.extraFields.push(field);
      }
    }

    // Find type mismatches
    for (const registeredField of registeredSchema.fields) {
      const detectedField = detectedSchema.fields[registeredField.name];
      if (detectedField && detectedField.type !== registeredField.type) {
        differences.typeMismatches.push({
          field: registeredField.name,
          expected: registeredField.type,
          actual: detectedField.type
        });
      }
    }

    return {
      matches: differences.missingFields.length === 0 &&
               differences.extraFields.length === 0 &&
               differences.typeMismatches.length === 0,
      differences
    };
  }
}

module.exports = new SchemaDetectorService();

