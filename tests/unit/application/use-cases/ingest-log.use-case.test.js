const IngestLogUseCase = require('../../../../src/application/use-cases/ingest-log.use-case');
const LogEntry = require('../../../../src/domain/entities/log-entry');

describe('IngestLogUseCase', () => {
    let useCase;
    let mockLogRepository;
    let mockValidationService;
    let mockLogger;

    const validLogData = {
        appId: 'service-a',
        level: 'INFO',
        message: 'Test message',
        timestamp: new Date().toISOString()
    };

    beforeEach(() => {
        mockLogRepository = {
            save: jest.fn().mockResolvedValue(true)
        };

        mockValidationService = {
            validateBatch: jest.fn().mockResolvedValue({
                validEntries: [validLogData],
                errors: []
            })
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis()
        };

        useCase = new IngestLogUseCase(mockLogRepository, mockValidationService, mockLogger);
    });

    test('should ingest valid log entry successfully', async () => {
        const logsData = [validLogData];
        await useCase.execute(logsData);

        expect(mockLogRepository.save).toHaveBeenCalledTimes(1);
        expect(mockLogRepository.save).toHaveBeenCalledWith([validLogData]);
    });

    test('should throw error if validation fails', async () => {
        mockValidationService.validateBatch.mockRejectedValue(new Error('Validation failed'));

        await expect(useCase.execute([validLogData])).rejects.toThrow('Validation failed');
        expect(mockLogRepository.save).not.toHaveBeenCalled();
    });

    test('should throw error if repository fails', async () => {
        mockLogRepository.save.mockRejectedValue(new Error('DB Error'));

        await expect(useCase.execute([validLogData])).rejects.toThrow('DB Error');
    });
});
