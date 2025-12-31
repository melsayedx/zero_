const Metadata = require('../../../../src/domain/value-objects/metadata');

describe('Metadata Value Object', () => {
    test('should allow empty metadata', () => {
        const metadata = new Metadata();
        expect(metadata.value).toEqual({});
        expect(metadata.string).toBe('{}');
    });

    test('should wrap valid object', () => {
        const data = { userId: 123, path: '/api' };
        const metadata = new Metadata(data);
        expect(metadata.value).toEqual(data);
        expect(metadata.string).toBe(JSON.stringify(data));
    });

    test('should handle non-object inputs by discarding or expecting object', () => {
        // Implementation throws if not object
        expect(() => new Metadata('string')).toThrow('Metadata must be an object');
        expect(() => new Metadata(null)).toThrow('Metadata must be an object');
    });
});
