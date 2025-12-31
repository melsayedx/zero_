const LogLevel = require('../../../../src/domain/value-objects/log-level');

describe('LogLevel Value Object', () => {
    test('should enforce valid log levels', () => {
        const validLevels = ['INFO', 'ERROR', 'WARN', 'DEBUG', 'FATAL'];
        validLevels.forEach(level => {
            const logLevel = LogLevel.get(level);
            expect(logLevel.value).toBe(level);
        });
    });

    test('should normalize lowercase levels to uppercase', () => {
        const logLevel = LogLevel.get('info');
        expect(logLevel.value).toBe('INFO');
    });

    // The implementation throws on invalid levels instead of defaulting
    test('should throw on invalid levels', () => {
        expect(() => LogLevel.get('UNKNOWN')).toThrow(/Invalid log level/);
        expect(() => LogLevel.get('')).toThrow(/Invalid log level/);
        expect(() => LogLevel.get(null)).toThrow('Log level must be a string');
    });

    test('should be immutable', () => {
        const logLevel = LogLevel.get('INFO');
        expect(Object.isFrozen(logLevel)).toBe(true);
    });

    test('should not be instantiable directly', () => {
        expect(() => new LogLevel('secret', 'INFO')).toThrow(/LogLevel cannot be instantiated directly/);
    });
});
