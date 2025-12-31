const { IngestLogController } = require('../../../../../src/interfaces/http/controllers');

describe('IngestLogController', () => {
    let controller;
    let mockRequestManager;
    let mockLogger;
    let mockReq;
    let mockReply;

    beforeEach(() => {
        mockRequestManager = {
            add: jest.fn().mockResolvedValue({
                isFullSuccess: jest.fn().mockReturnValue(true),
                accepted: 1,
                rejected: 0,
                throughput: 100
            })
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis()
        };

        controller = new IngestLogController(mockRequestManager, mockLogger);

        mockReq = {
            body: {
                appId: 'service-a',
                message: 'Hello World',
                level: 'INFO'
            }
        };

        mockReply = {
            code: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis()
        };
    });

    test('should return 202 Accepted for valid log', async () => {
        await controller.handle(mockReq, mockReply);

        expect(mockRequestManager.add).toHaveBeenCalledWith([mockReq.body]);
        expect(mockReply.code).toHaveBeenCalledWith(202);
        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('should return 400 Bad Request if result is not full success', async () => {
        mockRequestManager.add.mockResolvedValue({
            isFullSuccess: jest.fn().mockReturnValue(false),
            errors: [{ message: 'Validation failed' }]
        });

        await controller.handle(mockReq, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('should return 500 Internal Server Error on exception', async () => {
        mockRequestManager.add.mockRejectedValue(new Error('System failure'));

        await controller.handle(mockReq, mockReply);

        expect(mockReply.code).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Internal server error' }));
    });
});
