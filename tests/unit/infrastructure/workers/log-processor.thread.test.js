// We need to mock everything BEFORE requiring the thread file
// because it executes immediately upon require if not careful, 
// OR we rely on it being wrapped in an IIFE or function.
// Checking file: it is an IIFE: (async () => { ... })();
// This makes it hard to test without executing it.
// However, we can mock `parentPort` and `workerData` to control it.

const { parentPort, workerData } = require('worker_threads');

// Mock dependencies
jest.mock('worker_threads', () => ({
    parentPort: {
        on: jest.fn(),
        postMessage: jest.fn()
    },
    workerData: {
        workerIndex: 1,
        consumerName: 'test-consumer',
        workerRole: 'consumer',
        streamKey: 'logs',
        groupName: 'group',
        batchSize: 10,
        pollInterval: 10, // fast poll for testing
        clickhouseTable: 'logs'
    }
}));

// Mock Factories
const mockRedis = {
    pipeline: jest.fn().mockReturnThis(),
    xadd: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue()
};

const mockClickHouse = {
    insert: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue()
};

jest.mock('../../../../src/infrastructure/database/redis', () => ({
    createWorkerRedisClient: jest.fn(() => mockRedis)
}));

jest.mock('../../../../src/infrastructure/database/clickhouse', () => ({
    createClickHouseClient: jest.fn(() => mockClickHouse)
}));

// Mock Classes
const mockStreamQueue = {
    initialize: jest.fn().mockResolvedValue(),
    read: jest.fn().mockResolvedValue([]),
    readPending: jest.fn().mockResolvedValue([]),
    ack: jest.fn().mockResolvedValue(),
    recoverPendingMessages: jest.fn().mockResolvedValue([]),
    shutdown: jest.fn().mockResolvedValue()
};
jest.mock('../../../../src/infrastructure/queues/redis-stream-queue', () => {
    return jest.fn().mockImplementation(() => mockStreamQueue);
});

const mockBatchBuffer = {
    add: jest.fn().mockResolvedValue(),
    shutdown: jest.fn().mockResolvedValue(),
    getHealth: jest.fn().mockReturnValue({ size: 0 })
};
jest.mock('../../../../src/infrastructure/buffers/batch-buffer', () => {
    return jest.fn().mockImplementation(() => mockBatchBuffer);
});

jest.mock('../../../../src/infrastructure/persistence/clickhouse.repository');
jest.mock('../../../../src/infrastructure/retry-strategies/redis-retry-strategy');
jest.mock('../../../../src/infrastructure/logging', () => ({
    LoggerFactory: {
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            child: jest.fn().mockReturnThis()
        })
    }
}));

describe('LogProcessorThread', () => {
    // Since the file executes on require, we need to isolate execution
    // Jest's isolateModules allows this.

    // We also need to mock process.exit to avoid killing the test runner
    const originalExit = process.exit;
    beforeAll(() => {
        process.exit = jest.fn();
    });
    afterAll(() => {
        process.exit = originalExit;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize and start consumer loop', async () => {
        // Setup mocks for a single loop run
        mockStreamQueue.read
            .mockResolvedValueOnce([{ id: '1', data: { msg: 'test' } }]) // First read
            .mockResolvedValue([]); // Subsequent reads empty

        // We can't easily wait for the IIFE loop to finish as it's infinite in code.
        // We rely on standard mocks being called during "startup".

        jest.isolateModules(() => {
            require('../../../../src/infrastructure/workers/log-processor.thread');
        });

        // Wait a bit for async promises to settle
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockStreamQueue.initialize).toHaveBeenCalled();
        expect(mockStreamQueue.readPending).toHaveBeenCalled(); // Consumer checks pending on start
        expect(parentPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ready' }));
    });

    test('should handle shutdown message', async () => {
        // Capture message handler
        let messageHandler;
        parentPort.on.mockImplementation((event, cb) => {
            if (event === 'message') messageHandler = cb;
        });

        jest.isolateModules(() => {
            require('../../../../src/infrastructure/workers/log-processor.thread');
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        // Simulate shutdown
        if (messageHandler) {
            await messageHandler({ type: 'shutdown', requestId: 'req-1' });
        }

        expect(mockBatchBuffer.shutdown).toHaveBeenCalled();
        expect(mockStreamQueue.shutdown).toHaveBeenCalled();
        expect(parentPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'shutdown_complete',
            requestId: 'req-1'
        }));
    });
});
