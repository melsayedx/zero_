const RedisRetryStrategy = require('../../../../src/infrastructure/retry-strategies/redis-retry-strategy');

describe('RedisRetryStrategy', () => {
    let strategy;
    let mockRedis;
    let mockLogger;

    beforeEach(() => {
        mockRedis = {
            lpush: jest.fn().mockResolvedValue(1),
            rpop: jest.fn().mockResolvedValue(null),
            llen: jest.fn().mockResolvedValue(0)
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        strategy = new RedisRetryStrategy(mockRedis, {
            queueName: 'dlq',
            logger: mockLogger
        });
    });

    test('should queue items for retry', async () => {
        const items = [{ id: 1 }];
        const error = new Error('Insert failed');

        await strategy.queueForRetry(items, error);

        expect(mockRedis.lpush).toHaveBeenCalledWith('dlq', expect.stringContaining('"attempt":0'));
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should process retries and re-queue if failed', async () => {
        // Setup a failed item in the queue
        const item = JSON.stringify({
            items: [{ id: 1 }],
            error: { message: 'fail' },
            metadata: { attempt: 0 }
        });
        mockRedis.rpop.mockResolvedValueOnce(item);

        // We fake the timer to trigger the re-queue logic synchronous-ish
        jest.useFakeTimers();

        const result = await strategy.processRetries();

        expect(result.processed).toBe(1);

        // Fast-forward time for the setTimeout inside processRetries
        jest.runAllTimers();

        // It should have re-queued the item with attempt+1
        expect(mockRedis.lpush).toHaveBeenCalledWith('dlq', expect.stringContaining('"attempt":1'));

        jest.useRealTimers();
    });

    test('should drop items if max retries exceeded', async () => {
        const item = JSON.stringify({
            items: [{ id: 1 }],
            error: { message: 'fail' },
            metadata: { attempt: 3 } // Default max is 3
        });
        mockRedis.rpop.mockResolvedValueOnce(item);

        await strategy.processRetries();

        // Should NOT re-queue
        expect(mockRedis.lpush).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Max retries exceeded'), expect.any(Object));
    });
});
