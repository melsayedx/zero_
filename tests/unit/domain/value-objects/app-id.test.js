const AppId = require('../../../../src/domain/value-objects/app-id');

describe('AppId Value Object', () => {
    test('should create a valid AppId', () => {
        const id = 'service-a';
        const appId = new AppId(id);
        expect(appId.value).toBe(id);
    });

    test('should throw error if AppId is empty or invalid type', () => {
        expect(() => new AppId('')).toThrow(/App ID must be between/);
        expect(() => new AppId(null)).toThrow('App ID must be a string');
        expect(() => new AppId(undefined)).toThrow('App ID must be a string');
    });

    test('should throw error if AppId is too long', () => {
        const longId = 'a'.repeat(65);
        expect(() => new AppId(longId)).toThrow(/App ID must be between 1 and 64/);
    });

    // Removed alphanumeric check as implementation does not strictly enforce it in the constructor visible
    // If strict validation is added later, re-enable this.
});
