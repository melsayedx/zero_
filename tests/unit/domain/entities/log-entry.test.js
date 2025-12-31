const LogEntry = require('../../../../src/domain/entities/log-entry');

describe('LogEntry Entity', () => {
    // Input data expects snake_case keys as per implementation
    const validLogData = {
        app_id: 'service-a',
        message: 'User logged in',
        level: 'INFO',
        source: 'auth-service',
        environment: 'production',
        timestamp: new Date().toISOString(),
        metadata: { userId: '123' }
    };

    test('should create a normalized LogEntry object', () => {
        const log = LogEntry.normalize(validLogData);

        expect(log.appId).toBe('service-a');
        expect(log.level).toBe('INFO');
        expect(log.message).toBe('User logged in');
        expect(log.source).toBe('auth-service');
        expect(log.environment).toBe('production');
        expect(log.traceId).toBeDefined(); // Generated if missing
    });

    test('should throw error for missing required fields', () => {
        expect(() => LogEntry.normalize({ ...validLogData, app_id: null })).toThrow(/Missing required field/);
        expect(() => LogEntry.normalize({ ...validLogData, message: null })).toThrow(/Missing required field/);
    });

    test('should normalize log level', () => {
        const log = LogEntry.normalize({ ...validLogData, level: 'info' });
        expect(log.level).toBe('INFO');
    });

    test('should validate string fields constraints', () => {
        // Message too empty
        expect(() => LogEntry.normalize({ ...validLogData, message: '' })).toThrow(/Missing required field/); // caught by missing check

        // Environment too long
        const longEnv = 'a'.repeat(33);
        expect(() => LogEntry.normalize({ ...validLogData, environment: longEnv })).toThrow(/environment must be between/);
    });

    test('should produce persistable format', () => {
        const log = LogEntry.normalize(validLogData);

        expect(log).toHaveProperty('metadataString');
        expect(typeof log.metadataString).toBe('string');
        // Check camelCase output keys
        expect(log).toHaveProperty('appId');
        expect(log).toHaveProperty('userId');
    });
});
