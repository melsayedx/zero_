const ClickHouseRepository = require('../../../../src/infrastructure/persistence/clickhouse.repository');

describe('ClickHouseRepository', () => {
    let repository;
    let mockClient;
    let mockQueryCache;
    let mockLogger;

    beforeEach(() => {
        mockClient = {
            insert: jest.fn().mockResolvedValue({}),
            query: jest.fn().mockResolvedValue({
                stream: jest.fn().mockReturnValue((async function* () {
                    yield { id: '1', timestamp: '2023-01-01T00:00:00.000Z', metadata: '{}' };
                })())
            }),
            ping: jest.fn().mockResolvedValue(),
            command: jest.fn().mockResolvedValue()
        };

        mockQueryCache = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue()
        };

        mockLogger = {
            warn: jest.fn()
        };

        repository = new ClickHouseRepository(mockClient, {
            tableName: 'test_logs',
            queryCache: mockQueryCache,
            logger: mockLogger
        });
    });

    test('save should insert logs in correct format', async () => {
        const logs = [{
            appId: 'test-app',
            message: 'test',
            source: 'test-source',
            level: 'INFO',
            environment: 'prod',
            metadataString: '{}',
            traceId: 'trace-1',
            userId: 'user-1'
        }];

        await repository.save(logs);

        expect(mockClient.insert).toHaveBeenCalledWith(expect.objectContaining({
            table: 'test_logs',
            format: 'JSONEachRow',
            values: expect.arrayContaining([
                expect.objectContaining({
                    app_id: 'test-app',
                    message: 'test'
                })
            ])
        }));
    });

    test('findBy should build correct query and parse metadata', async () => {
        const result = await repository.findBy({
            filter: { app_id: 'test-app' },
            limit: 10
        });

        // Verify query construction
        expect(mockClient.query).toHaveBeenCalledWith(expect.objectContaining({
            format: 'JSONEachRow',
            query: expect.stringContaining("WHERE `app_id` = 'test-app'")
        }));

        // Verify result parsing
        expect(result.logs[0].id).toBe('1');
        expect(result.logs[0]).toHaveProperty('metadata');
    });

    test('healthCheck should return healthy status on success', async () => {
        const result = await repository.healthCheck();

        expect(result.healthy).toBe(true);
        expect(mockClient.ping).toHaveBeenCalled();
        expect(mockClient.command).toHaveBeenCalled();
    });

    test('healthCheck should handle failures', async () => {
        mockClient.ping.mockRejectedValue(new Error('Connection failed'));

        const result = await repository.healthCheck();

        expect(result.healthy).toBe(false);
    });
});
