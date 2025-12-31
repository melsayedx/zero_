const RequestManager = require('../../../../src/infrastructure/request-processing/request-manager');
const { EventEmitter } = require('events');

// Mock Processor that just resolves with success
const mockProcessor = jest.fn(async (batch) => {
    return batch.map(item => ({ success: true, id: item.id }));
});

describe('RequestManager Infrastructure', () => {
    let requestManager;
    let loggerMock;

    beforeEach(() => {
        jest.useFakeTimers();
        mockProcessor.mockClear();

        loggerMock = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        requestManager = new RequestManager(mockProcessor, {
            enabled: true,
            maxWaitTime: 100, // 100ms
            maxBatchSize: 3,  // small batch for testing
            logger: loggerMock
        });
    });

    afterEach(async () => {
        await requestManager.shutdown();
        jest.useRealTimers();
    });

    test('should process single request immediately if disabled', async () => {
        requestManager.setEnabled(false);
        const result = await requestManager.add({ id: 1 });

        expect(result).toEqual({ success: true, id: 1 });
        expect(mockProcessor).toHaveBeenCalledTimes(1);
        expect(mockProcessor).toHaveBeenCalledWith([{ id: 1 }]);
    });

    test('should coalesce requests until batch size reached', async () => {
        const p1 = requestManager.add({ id: 1 });
        const p2 = requestManager.add({ id: 2 });

        // Should not have processed yet
        expect(mockProcessor).not.toHaveBeenCalled();

        const p3 = requestManager.add({ id: 3 }); // Trigger flush

        const results = await Promise.all([p1, p2, p3]);

        expect(mockProcessor).toHaveBeenCalledTimes(1);
        expect(mockProcessor).toHaveBeenCalledWith([
            { id: 1 }, { id: 2 }, { id: 3 }
        ]);
        expect(results).toHaveLength(3);
    });

    test('should flush on timeout if batch not full', async () => {
        const p1 = requestManager.add({ id: 1 });

        expect(mockProcessor).not.toHaveBeenCalled();

        // Advance time
        jest.advanceTimersByTime(100);

        const result = await p1;

        expect(mockProcessor).toHaveBeenCalledTimes(1);
        expect(mockProcessor).toHaveBeenCalledWith([{ id: 1 }]);
        expect(result).toEqual({ success: true, id: 1 });
    });

    test('should handle ping-pong buffer usage', async () => {
        // Fill batch 1 (Buffer A)
        const batch1 = [
            requestManager.add({ id: 1 }),
            requestManager.add({ id: 2 }),
            requestManager.add({ id: 3 })
        ];

        // Wait for first flush to start (it's async)
        await Promise.all(batch1);
        expect(mockProcessor).toHaveBeenCalledTimes(1); // Buffer A flushed

        // Fill batch 2 (Should use Buffer B)
        const batch2 = [
            requestManager.add({ id: 4 }),
            requestManager.add({ id: 5 }),
            requestManager.add({ id: 6 })
        ];

        await Promise.all(batch2);
        expect(mockProcessor).toHaveBeenCalledTimes(2); // Buffer B flushed

        // Verify payloads
        expect(mockProcessor.mock.calls[0][0]).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(mockProcessor.mock.calls[1][0]).toEqual([{ id: 4 }, { id: 5 }, { id: 6 }]);
    });

    test('should propagate errors to specific callers', async () => {
        const errorProcessor = jest.fn(async (batch) => {
            return batch.map(item => {
                if (item.id === 2) return { error: 'Invalid ID' };
                return { success: true };
            });
        });

        requestManager.processor = errorProcessor;

        const p1 = requestManager.add({ id: 1 });
        const p2 = requestManager.add({ id: 2 });
        const p3 = requestManager.add({ id: 3 });

        await expect(p1).resolves.toEqual({ success: true });
        await expect(p2).rejects.toThrow('Invalid ID'); // Specific error
        await expect(p3).resolves.toEqual({ success: true });
    });

    test('should properly shutdown and flush pending', async () => {
        const p1 = requestManager.add({ id: 1 });

        const shutdownPromise = requestManager.shutdown();

        await Promise.all([p1, shutdownPromise]);

        expect(mockProcessor).toHaveBeenCalledWith([{ id: 1 }]);
        expect(loggerMock.info).toHaveBeenCalledWith('RequestManager shutdown complete');
    });

    test('should NOT leak timers', async () => {
        requestManager.add({ id: 1 });

        // Timer should exist
        expect(requestManager.timer).not.toBeNull();

        // Force flush manually
        await requestManager.forceFlush();

        // Timer should be cleared
        expect(requestManager.timer).toBeNull();
    });
});
