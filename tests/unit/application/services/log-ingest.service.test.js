const LogIngestionService = require('../../../../src/application/services/log-ingest.service');

describe('LogIngestionService', () => {
    let service;
    let mockIngestLogUseCase;
    let mockLogger;

    beforeEach(() => {
        mockIngestLogUseCase = {
            execute: jest.fn().mockResolvedValue({
                errors: [],
                processingTime: 10,
                throughput: 100,
                validationMode: 'standard'
            })
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            child: jest.fn().mockReturnThis()
        };

        service = new LogIngestionService(mockIngestLogUseCase, mockLogger);
    });

    test('should process a batch of requests', async () => {
        // Input: Array<Array<Log>>
        const requestBatch = [
            [{ appId: 'a', message: '1' }],
            [{ appId: 'b', message: '2' }]
        ];

        const results = await service.processBatch(requestBatch);

        expect(results).toHaveLength(2);
        expect(mockIngestLogUseCase.execute).toHaveBeenCalledTimes(1);

        // Assert return type structure (IngestResultish)
        expect(results[0]).toMatchObject({ accepted: 1, rejected: 0 });
        expect(results[1]).toMatchObject({ accepted: 1, rejected: 0 });
    });

    test('should handle individual failures in batch', async () => {
        const requestBatch = [
            [{ appId: 'a', message: '1' }],
            [{ appId: 'b', message: '2' }]
        ];

        // Simulate UseCase returns error for index 1 (which refers to second log in flattened list)
        mockIngestLogUseCase.execute.mockResolvedValue({
            errors: [{ index: 1, error: 'Validation Error' }],
            processingTime: 10,
            throughput: 100
        });

        const results = await service.processBatch(requestBatch);

        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({ accepted: 1, rejected: 0 }); // First request succeeded
        expect(results[1]).toMatchObject({ accepted: 0, rejected: 1, errors: [{ error: 'Validation Error' }] }); // Second request failed
    });

    test('should return empty array for empty batch', async () => {
        const results = await service.processBatch([]);
        expect(results).toEqual([]);
        expect(mockIngestLogUseCase.execute).not.toHaveBeenCalled();
    });
});
