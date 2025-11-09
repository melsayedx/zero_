/**
 * Unit tests for validator utility
 */

const {
  validateLogEntry,
  validateQuery,
  normalizeTimestamp,
  sanitizeMessage,
  isValidLogEntry
} = require('../../src/utils/validator');

describe('Validator Utility', () => {
  describe('validateLogEntry', () => {
    test('should validate correct log entry', () => {
      const log = {
        timestamp: new Date(),
        level: 'INFO',
        message: 'Test message',
        service: 'test-service',
        metadata: { key: 'value' }
      };

      const { error, value } = validateLogEntry(log);
      expect(error).toBeUndefined();
      expect(value).toBeDefined();
    });

    test('should reject invalid log level', () => {
      const log = {
        level: 'INVALID',
        message: 'Test',
        service: 'test'
      };

      const { error } = validateLogEntry(log);
      expect(error).toBeDefined();
    });
  });

  describe('normalizeTimestamp', () => {
    test('should normalize Date object', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = normalizeTimestamp(date);
      expect(result).toBe('2024-01-01T00:00:00.000Z');
    });

    test('should normalize ISO string', () => {
      const isoString = '2024-01-01T00:00:00.000Z';
      const result = normalizeTimestamp(isoString);
      expect(result).toBe(isoString);
    });
  });

  describe('isValidLogEntry', () => {
    test('should return true for valid log', () => {
      const log = {
        level: 'INFO',
        message: 'Test',
        service: 'test'
      };
      expect(isValidLogEntry(log)).toBe(true);
    });

    test('should return false for invalid log', () => {
      const log = { invalid: 'data' };
      expect(isValidLogEntry(log)).toBe(false);
    });
  });
});

