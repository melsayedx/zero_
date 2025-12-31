const TraceId = require('../../../../src/domain/value-objects/trace-id');

describe('TraceId Value Object', () => {
    test('should create a valid TraceId', () => {
        const id = 'abc-123-xyz';
        const traceId = new TraceId(id);
        expect(traceId.value).toBe(id);
    });

    test('should be null if none provided', () => {
        const traceId = new TraceId();
        expect(traceId.value).toBeNull();
    });

    test('should use provided ID if present', () => {
        const id = 'existing-trace-id';
        const traceId = new TraceId(id);
        expect(traceId.value).toBe(id);
    });
});
