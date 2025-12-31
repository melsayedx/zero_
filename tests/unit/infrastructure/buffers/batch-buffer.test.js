const BatchBuffer = require('../../../../src/infrastructure/buffers/batch-buffer');

describe('BatchBuffer Infrastructure', () => {
    let batchBuffer;
    let mockRepo;
    let mockRetryStrategy;
    let mockLogger;

    beforeEach(() => {
        jest.useFakeTimers();

        mockRepo = {
            save: jest.fn().mockResolvedValue(true)
        };

        // Mock retry strategy
        mockRetryStrategy = {
            queueForRetry: jest.fn().mockResolvedValue(true),
            shutdown: jest.fn().mockResolvedValue(true)
        };

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        batchBuffer = new BatchBuffer(mockRepo, mockRetryStrategy, {
            maxBatchSize: 5,
            maxWaitTime: 500,
            maxConcurrentFlushes: 2,
            logger: mockLogger
        });
    });

    afterEach(async () => {
        await batchBuffer.shutdown();
        jest.useRealTimers();
    });

    test('should buffer logs and flush when size reached', async () => {
        const logs = [1, 2, 3, 4, 5].map(i => ({ id: i }));

        await batchBuffer.add(logs);

        // Should have flushed immediately as it hit maxBatchSize (5)
        expect(mockRepo.save).toHaveBeenCalledTimes(1);
        expect(mockRepo.save).toHaveBeenCalledWith(logs);
        expect(batchBuffer.count).toBe(0);
    });

    test('should buffer logs and flush on timeout', async () => {
        const logs = [{ id: 1 }];
        await batchBuffer.add(logs);

        expect(mockRepo.save).not.toHaveBeenCalled();

        jest.advanceTimersByTime(500);

        expect(mockRepo.save).toHaveBeenCalledWith(logs);
    });

    test('should handle backpressure', async () => {
        jest.useRealTimers();
        // Control when save resolves
        let resolveSave;
        const savePromise = new Promise(resolve => { resolveSave = resolve; });
        mockRepo.save.mockReturnValue(savePromise);

        // 1. Fill buffer triggers flush 1
        // We use Promise.all to ensure add() logic runs up to the await point
        const p1 = batchBuffer.add(Array(5).fill({ id: 1 }));

        // 2. Fill buffer triggers flush 2
        const p2 = batchBuffer.add(Array(5).fill({ id: 2 }));

        // Allow microtasks to process (start flushing)
        await new Promise(resolve => process.nextTick(resolve));

        expect(batchBuffer.activeFlushes.size).toBe(2);

        // 3. Next add should wait
        const p3 = batchBuffer.add(Array(5).fill({ id: 3 }));

        // Verify it hasn't resolved yet (it's waiting for slot)
        expect(batchBuffer.activeFlushes.size).toBe(2);

        // Now resolve the saves
        resolveSave(true);

        // Wait for all to complete
        await Promise.all([p1, p2, p3]);

        expect(batchBuffer.activeFlushes.size).toBe(0);
    });

    test('should retry on failure', async () => {
        mockRepo.save.mockRejectedValueOnce(new Error('DB connection failed'));

        const logs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

        await batchBuffer.add(logs);

        // Should catch the error and queue for retry
        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockRetryStrategy.queueForRetry).toHaveBeenCalledWith(
            logs,
            expect.any(Error),
            expect.anything()
        );
    });

    test('should flush pending on shutdown', async () => {
        const logs = [{ id: 1 }];
        await batchBuffer.add(logs);

        await batchBuffer.shutdown();

        expect(mockRepo.save).toHaveBeenCalledWith(logs);
    });
});
