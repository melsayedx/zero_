const LogProcessorThreadManager = require('../../../../src/infrastructure/workers/log-processor-thread-manager');
const { Worker } = require('worker_threads');

// Mock Worker threads
jest.mock('worker_threads', () => {
    return {
        Worker: jest.fn().mockImplementation(() => ({
            on: jest.fn(),
            postMessage: jest.fn(),
            off: jest.fn(),
            terminate: jest.fn(),
            ref: jest.fn(),
            unref: jest.fn()
        }))
    };
});

describe('LogProcessorThreadManager', () => {
    let manager;
    let mockLogger;

    beforeEach(() => {
        jest.clearAllMocks(); // Ensure call counts are reset

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            child: jest.fn().mockReturnThis()
        };

        manager = new LogProcessorThreadManager({
            workerCount: 2,
            streamKey: 'logs:stream',
            groupName: 'test-group',
            logger: mockLogger
        });
    });

    test('should spawn correct number of workers', async () => {
        // Mock worker implementation
        const workerMockInstance = {
            on: jest.fn((event, cb) => {
                if (event === 'message') {
                    // Invoke immediately
                    cb({ type: 'ready' });
                }
            }),
            off: jest.fn(),
            postMessage: jest.fn(),
            terminate: jest.fn(),
            ref: jest.fn(),
            unref: jest.fn()
        };

        Worker.mockImplementation(() => workerMockInstance);

        await manager.start();

        expect(Worker).toHaveBeenCalledTimes(2);
        expect(manager.workers.size).toBe(2);
    });

    test('should restart worker on crash', async () => {
        jest.useFakeTimers();

        let exitCallbacks = {}; // map index to callback
        let spawnCount = 0;

        Worker.mockImplementation(() => {
            const myIndex = spawnCount++; // 0, then 1, then restart...
            // Note: manager spawns 0 then 1.
            // So for start(), myIndex 0 is worker 0, myIndex 1 is worker 1.

            return {
                on: jest.fn((event, cb) => {
                    if (event === 'exit') exitCallbacks[myIndex] = cb;
                    if (event === 'message') {
                        // Start ready
                        cb({ type: 'ready' });
                    }
                }),
                off: jest.fn(),
                terminate: jest.fn(),
                postMessage: jest.fn(),
                ref: jest.fn(),
                unref: jest.fn()
            };
        });

        await manager.start();

        expect(manager.workers.size).toBe(2);

        // Trigger exit on worker 0 (myIndex 0)
        // Note: exitCallbacks keys are integers.
        if (exitCallbacks[0]) {
            exitCallbacks[0](1); // exit code 1
        } else {
            throw new Error('Exit callback for worker 0 not found');
        }

        expect(manager.workers.has(0)).toBe(false); // Should be gone

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('crashed'), expect.any(Object));

        // Advance timers to trigger restart
        jest.runAllTimers();

        // Should have respawned
        expect(Worker).toHaveBeenCalledTimes(3);

        jest.useRealTimers();
    });

    test('should shutdown all workers gracefully', async () => {
        // Mock workers for shutdown
        Worker.mockImplementation(() => {
            const m = {
                on: jest.fn((event, cb) => {
                    // Registration
                }),
                off: jest.fn(),
                postMessage: jest.fn((msg) => {
                    if (msg && msg.type === 'shutdown') {
                        // Find the handler waiting for shutdown_complete
                        const calls = m.on.mock.calls;
                        const messageHandlers = calls.filter(c => c[0] === 'message').map(c => c[1]);

                        messageHandlers.forEach(handler => {
                            handler({ type: 'shutdown_complete', requestId: msg.requestId });
                        });
                    }
                }),
                terminate: jest.fn(),
                ref: jest.fn(),
                unref: jest.fn()
            };

            // Manually trigger ready for the start() phase
            setTimeout(() => {
                const messageHandlers = m.on.mock.calls.filter(c => c[0] === 'message').map(c => c[1]);
                messageHandlers.forEach(handler => handler({ type: 'ready' }));
            }, 0);

            return m;
        });

        await manager.start();

        expect(manager.workers.size).toBe(2);

        await manager.shutdown();

        expect(manager.workers.size).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith('All worker threads shut down');
    });
});
