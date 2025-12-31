const LogRetrievalUseCase = require('../../../../src/application/use-cases/log-retrieval.use-case');
const SemanticSearchUseCase = require('../../../../src/application/use-cases/semantic-search.use-case');
// Mock QueryResult since it is used in LogRetrievalUseCase
const QueryResult = require('../../../../src/application/use-cases/query-result');

jest.mock('../../../../src/application/use-cases/query-result', () => {
    return jest.fn().mockImplementation((data) => data);
});

describe('Retrieval Use Cases', () => {
    let mockRepository;
    let mockEmbeddingProvider;
    let mockLogger;

    beforeEach(() => {
        mockRepository = {
            findBy: jest.fn().mockResolvedValue({
                logs: [],
                hasMore: false,
                nextCursor: null
            }),
            findSimilar: jest.fn().mockResolvedValue([])
        };

        mockEmbeddingProvider = {
            embed: jest.fn().mockResolvedValue([[0.1, 0.2]]),
            getName: jest.fn().mockReturnValue('mock-provider')
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn()
        };
    });

    describe('LogRetrievalUseCase', () => {
        test('execute should call repository with correct params', async () => {
            const useCase = new LogRetrievalUseCase(mockRepository);

            await useCase.execute('test-app', 50);

            expect(mockRepository.findBy).toHaveBeenCalledWith({
                filter: { app_id: 'test-app' },
                limit: 50
            });
        });

        test('execute should validate inputs', async () => {
            const useCase = new LogRetrievalUseCase(mockRepository);

            await expect(useCase.execute('')).rejects.toThrow('app_id is required');
            await expect(useCase.execute('app', 10001)).rejects.toThrow('Limit must be');
        });
    });

    describe('SemanticSearchUseCase', () => {
        test('execute should generate embedding and search', async () => {
            const useCase = new SemanticSearchUseCase(mockRepository, mockEmbeddingProvider, mockLogger);

            const result = await useCase.execute({ query: 'error', appId: 'app-1' });

            expect(result.success).toBe(true);
            expect(mockEmbeddingProvider.embed).toHaveBeenCalledWith(['error']);
            expect(mockRepository.findSimilar).toHaveBeenCalledWith([0.1, 0.2], expect.objectContaining({ appId: 'app-1' }));
        });

        test('execute should return error if empty query', async () => {
            const useCase = new SemanticSearchUseCase(mockRepository, mockEmbeddingProvider, mockLogger);

            const result = await useCase.execute({ query: '   ' });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Query string is required/);
        });

        test('execute should handle provider failure', async () => {
            mockEmbeddingProvider.embed.mockRejectedValue(new Error('API Down'));

            const useCase = new SemanticSearchUseCase(mockRepository, mockEmbeddingProvider, mockLogger);
            const result = await useCase.execute({ query: 'error' });

            expect(result.success).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
