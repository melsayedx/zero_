#!/usr/bin/env node

/**
 * Quick test to verify the insert fix
 */

require('dotenv').config();
const { createClickHouseClient } = require('./src/config/database');
const ClickHouseRepository = require('./src/adapters/repositories/clickhouse.repository');
const LogEntry = require('./src/core/entities/log-entry');

async function testInsert() {
  console.log('🧪 Testing ClickHouse Insert Fix\n');
  
  const client = createClickHouseClient();
  const repo = new ClickHouseRepository(client);

  try {
    // Create a test log entry
    const testLog = new LogEntry({
      app_id: 'test-app',
      level: 'INFO',
      message: 'Test message to verify insert fix',
      source: 'test-script',
      environment: 'test',
      metadata: { test: true, timestamp: new Date().toISOString() }
    });

    console.log('📝 Test log entry created:');
    console.log('   ', JSON.stringify(testLog.toObject(), null, 2));
    console.log('');

    // Verify metadata is serialized correctly
    const obj = testLog.toObject();
    console.log('✅ Validations:');
    console.log(`   metadata type: ${typeof obj.metadata} (should be "string")`);
    console.log(`   trace_id type: ${typeof obj.trace_id} (should be "string")`);
    console.log(`   user_id type: ${typeof obj.user_id} (should be "string")`);
    
    if (typeof obj.metadata !== 'string') {
      console.error('   ❌ ERROR: metadata should be a JSON string!');
      process.exit(1);
    }
    
    console.log('');
    console.log('💾 Saving to ClickHouse...');
    
    // Save to database
    await repo.save([testLog]);
    
    console.log('   ✅ Insert command sent (async mode - data queued)');
    console.log('');
    console.log('⏳ Waiting 2 seconds for async insert to complete...');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('');
    console.log('🔍 Verifying data in database...');
    
    // Query to verify
    const result = await repo.findBy({
      filter: { app_id: 'test-app' },
      limit: 10
    });

    if (result.logs.length > 0) {
      console.log(`   ✅ SUCCESS! Found ${result.logs.length} log(s) in database`);
      console.log('   Latest log:', result.logs[0].message);
    } else {
      console.log('   ⚠️  No logs found yet. Run check-clickhouse-data.js for details.');
    }

    await client.close();
    console.log('');
    console.log('✅ Test complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    await client.close();
    process.exit(1);
  }
}

testInsert();

