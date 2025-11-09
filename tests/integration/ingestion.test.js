/**
 * Integration tests for log ingestion
 */

const request = require('supertest');
const app = require('../../src/app');

describe('Log Ingestion API', () => {
  describe('POST /api/v1/ingest', () => {
    test('should accept valid log entry', async () => {
      const log = {
        level: 'INFO',
        message: 'Test log message',
        service: 'test-service',
        metadata: { requestId: '123' }
      };

      // Note: This test requires API key authentication
      // You'll need to set up test authentication
      const response = await request(app)
        .post('/api/v1/ingest')
        .set('x-api-key', 'test-api-key')
        .send(log);

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('accepted');
    });
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
    });
  });
});

