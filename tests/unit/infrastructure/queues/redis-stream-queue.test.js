const RedisStreamQueue = require('../../../../src/infrastructure/queues/redis-stream-queue');

describe('RedisStreamQueue', () => {
    let queue;
    let mockRedis;
    let mockLogger;

    beforeEach(() => {
        mockRedis = {
            xgroup: jest.fn().mockResolvedValue('OK'),
            xreadgroup: jest.fn().mockResolvedValue([]),
            xack: jest.fn().mockResolvedValue(1),
            xpending: jest.fn().mockResolvedValue([0, null, null, []]),
            xautoclaim: jest.fn().mockResolvedValue(['0-0', [], []])
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        queue = new RedisStreamQueue(mockRedis, {
            streamKey: 'logs:stream',
            groupName: 'log-processors',
            consumerName: 'worker-1',
            batchSize: 10,
            logger: mockLogger
        });
    });

    test('initialize should create consumer group', async () => {
        await queue.initialize();

        expect(mockRedis.xgroup).toHaveBeenCalledWith(
            'CREATE', 'logs:stream', 'log-processors', '0', 'MKSTREAM'
        );
        expect(queue.isInitialized).toBe(true);
    });

    test('initialize should ignore BUSYGROUP error', async () => {
        mockRedis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));

        await queue.initialize();

        expect(queue.isInitialized).toBe(true);
        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('BUSYGROUP'), expect.any(Object));
    });

    test('read should parse messages correctly', async () => {
        const mockResponse = [
            ['logs:stream', [
                ['1-0', ['data', '{"id":1}']],
                ['2-0', ['data', '{"id":2}']]
            ]]
        ];
        mockRedis.xreadgroup.mockResolvedValue(mockResponse);

        const messages = await queue.read(2);

        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({ id: '1-0', data: { id: 1 } });
        expect(messages[1]).toEqual({ id: '2-0', data: { id: 2 } });
    });

    test('readPending should paginate results', async () => {
        // First call returns 1 message, second call returns empty (end of stream)
        mockRedis.xreadgroup
            .mockResolvedValueOnce([['logs:stream', [['1-0', ['data', '{"id":1}']]]]])
            .mockResolvedValueOnce([['logs:stream', []]]);

        const messages = await queue.readPending(10);

        expect(messages).toHaveLength(1);
        expect(mockRedis.xreadgroup).toHaveBeenCalledTimes(2);
    });

    test('ack should acknowledge messages', async () => {
        const count = await queue.ack(['1-0', '2-0']);

        expect(count).toBe(1);
        expect(mockRedis.xack).toHaveBeenCalledWith('logs:stream', 'log-processors', '1-0', '2-0');
    });

    test('recoverPendingMessages should claim and parse', async () => {
        mockRedis.xautoclaim.mockResolvedValue([
            '0-0', // cursor reset means done
            [['1-0', ['data', '{"id":1}']]], // messages
            [] // deleted
        ]);

        const messages = await queue.recoverPendingMessages();

        expect(messages).toHaveLength(1);
        expect(messages[0].data.id).toBe(1);
    });
});
