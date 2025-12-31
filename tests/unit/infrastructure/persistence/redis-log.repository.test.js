const RedisLogRepository = require('../../../../src/infrastructure/persistence/redis-log.repository');

describe('RedisLogRepository', () => {
    let repository;
    let mockClient;
    let mockPipeline;
    let mockLogger;

    beforeEach(() => {
        mockPipeline = {
            xadd: jest.fn(),
            exec: jest.fn().mockResolvedValue([])
        };

        mockClient = {
            pipeline: jest.fn().mockReturnValue(mockPipeline),
            ping: jest.fn().mockResolvedValue('PONG'),
            xlen: jest.fn().mockResolvedValue(100)
        };

        mockLogger = {
            debug: jest.fn(),
            error: jest.fn()
        };

        repository = new RedisLogRepository(mockClient, {
            streamKey: 'test:logs',
            logger: mockLogger
        });
    });

    test('save should pipeline log entries', async () => {
        const logs = [{ id: 1 }, { id: 2 }];

        await repository.save(logs);

        expect(mockClient.pipeline).toHaveBeenCalled();
        expect(mockPipeline.xadd).toHaveBeenCalledTimes(2);
        expect(mockPipeline.xadd).toHaveBeenCalledWith(
            'test:logs', 'MAXLEN', '~', '1000000', '*', 'data', expect.any(String)
        );
        expect(mockPipeline.exec).toHaveBeenCalled();
    });

    test('save should handle errors gracefully', async () => {
        mockPipeline.exec.mockRejectedValue(new Error('Redis Error'));

        const logs = [{ id: 1 }];

        await expect(repository.save(logs)).rejects.toThrow('Failed to queue logs');
        expect(mockLogger.error).toHaveBeenCalled();
    });

    test('healthCheck should return status', async () => {
        const result = await repository.healthCheck();
        expect(result.healthy).toBe(true);
    });
});
