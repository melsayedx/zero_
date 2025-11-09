/**
 * Simple Test Example
 * Shows how easy it is to test the clean architecture
 * Run with: node test-example.js
 */

const IngestLogUseCase = require('./src/core/use-cases/ingest-log.use-case');

// Mock repository (no database needed!)
class MockRepository {
  constructor() {
    this.logs = [];
  }

  async save(logEntry) {
    this.logs.push(logEntry.toJSON());
    console.log('✓ Mock repository saved log:', logEntry.toJSON());
  }

  async find(criteria) {
    return this.logs;
  }
}

// Run test
async function runTest() {
  console.log('🧪 Testing Ingest Log Use Case\n');

  const mockRepo = new MockRepository();
  const useCase = new IngestLogUseCase(mockRepo);

  // Test 1: Valid log
  console.log('Test 1: Valid log');
  const result1 = await useCase.execute({
    level: 'INFO',
    message: 'Test message',
    service: 'test-service',
    metadata: { test: true }
  });
  console.log('Result:', result1.success ? '✅ PASS' : '❌ FAIL');
  console.log('');

  // Test 2: Invalid log level
  console.log('Test 2: Invalid log level');
  const result2 = await useCase.execute({
    level: 'INVALID',
    message: 'Test',
    service: 'test'
  });
  console.log('Result:', !result2.success ? '✅ PASS' : '❌ FAIL');
  console.log('Error:', result2.error);
  console.log('');

  // Test 3: Missing required field
  console.log('Test 3: Missing required field');
  const result3 = await useCase.execute({
    level: 'INFO',
    service: 'test'
    // Missing message
  });
  console.log('Result:', !result3.success ? '✅ PASS' : '❌ FAIL');
  console.log('Error:', result3.error);
  console.log('');

  // Check mock repository
  console.log('📊 Mock Repository State:');
  console.log(`Total logs saved: ${mockRepo.logs.length}`);
  console.log('Logs:', JSON.stringify(mockRepo.logs, null, 2));

  console.log('\n✅ All tests completed!');
  console.log('\n💡 Key Takeaway:');
  console.log('   We tested business logic WITHOUT starting a database!');
  console.log('   This is the power of clean architecture.');
}

runTest().catch(console.error);

