/**
 * Test script for gRPC Authentication Flow
 * Tests gRPC methods with JWT authentication
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const http = require('http');

const GRPC_URL = 'localhost:50051';
const HTTP_URL = 'http://localhost:3000';

// Load proto file
const PROTO_PATH = path.join(__dirname, 'proto/logs.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const logsProto = grpc.loadPackageDefinition(packageDefinition).logs;

// Helper to register and login via HTTP to get token
function httpRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, HTTP_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Setup authentication (register user, login, create app)
async function setupAuth() {
  console.log('\n🔧 Setting up authentication...');

  // Register user
  const email = `grpc_test_${Date.now()}@example.com`;
  const password = 'GrpcTest123';

  console.log(`📝 Registering user: ${email}`);
  await httpRequest('POST', '/api/auth/register', { email, password });

  // Login
  console.log(`🔐 Logging in...`);
  const loginResponse = await httpRequest('POST', '/api/auth/login', { email, password });
  
  if (!loginResponse.success || !loginResponse.token) {
    throw new Error('Failed to login');
  }

  const token = loginResponse.token;
  console.log(`✅ Got token: ${token.substring(0, 30)}...`);

  // Create app
  console.log(`📱 Creating app...`);
  const client = new logsProto.LogService(GRPC_URL, grpc.credentials.createInsecure());
  
  // Use HTTP to create app since gRPC doesn't have app management endpoints
  const appResponse = await httpRequest('POST', '/api/apps', { app_name: `gRPC Test App ${Date.now()}` }, {
    Authorization: `Bearer ${token}`
  });

  // HTTP request with auth
  const appResult = await new Promise((resolve, reject) => {
    const url = new URL('/api/apps', HTTP_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ app_name: `gRPC Test App ${Date.now()}` }));
    req.end();
  });

  if (!appResult.success || !appResult.app) {
    throw new Error('Failed to create app');
  }

  const appId = appResult.app.app_id;
  console.log(`✅ Created app: ${appId}`);

  return { token, appId, client };
}

// Test 1: gRPC IngestLogs with authentication
function testIngestLogsWithAuth(client, token, appId) {
  return new Promise((resolve, reject) => {
    console.log('\n📝 Test 1: gRPC IngestLogs (With Authentication)');
    console.log('=' .repeat(50));

    const metadata = new grpc.Metadata();
    metadata.set('authorization', `Bearer ${token}`);

    const request = {
      logs: [
        {
          app_id: appId,
          level: 'INFO',
          message: 'gRPC test log message',
          timestamp: new Date().toISOString(),
          metadata: JSON.stringify({ test: true })
        }
      ]
    };

    client.IngestLogs(request, metadata, (error, response) => {
      if (error) {
        console.log(`❌ Error: ${error.message}`);
        console.log(`Code: ${error.code}`);
        resolve(false);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        if (response.success) {
          console.log('✅ IngestLogs with auth successful');
          resolve(true);
        } else {
          console.log('❌ IngestLogs failed');
          resolve(false);
        }
      }
    });
  });
}

// Test 2: gRPC IngestLogs without authentication
function testIngestLogsWithoutAuth(client, appId) {
  return new Promise((resolve) => {
    console.log('\n🚫 Test 2: gRPC IngestLogs (Without Authentication)');
    console.log('=' .repeat(50));

    const request = {
      logs: [
        {
          app_id: appId,
          level: 'INFO',
          message: 'This should fail',
          timestamp: new Date().toISOString(),
          metadata: '{}'
        }
      ]
    };

    client.IngestLogs(request, (error, response) => {
      if (error) {
        console.log(`✅ Correctly rejected: ${error.message}`);
        console.log(`Code: ${error.code} (${error.code === grpc.status.UNAUTHENTICATED ? 'UNAUTHENTICATED' : 'OTHER'})`);
        resolve(error.code === grpc.status.UNAUTHENTICATED);
      } else {
        console.log('❌ Should have been rejected without auth');
        resolve(false);
      }
    });
  });
}

// Test 3: gRPC IngestLogs with invalid token
function testIngestLogsWithInvalidToken(client, appId) {
  return new Promise((resolve) => {
    console.log('\n🚫 Test 3: gRPC IngestLogs (Invalid Token)');
    console.log('=' .repeat(50));

    const metadata = new grpc.Metadata();
    metadata.set('authorization', 'Bearer invalid-token-here');

    const request = {
      logs: [
        {
          app_id: appId,
          level: 'INFO',
          message: 'This should fail',
          timestamp: new Date().toISOString(),
          metadata: '{}'
        }
      ]
    };

    client.IngestLogs(request, metadata, (error, response) => {
      if (error) {
        console.log(`✅ Correctly rejected: ${error.message}`);
        console.log(`Code: ${error.code} (${error.code === grpc.status.UNAUTHENTICATED ? 'UNAUTHENTICATED' : 'OTHER'})`);
        resolve(error.code === grpc.status.UNAUTHENTICATED);
      } else {
        console.log('❌ Should have been rejected with invalid token');
        resolve(false);
      }
    });
  });
}

// Test 4: gRPC GetLogsByAppId with authentication
function testGetLogsByAppIdWithAuth(client, token, appId) {
  return new Promise((resolve) => {
    console.log('\n🔍 Test 4: gRPC GetLogsByAppId (With Authentication)');
    console.log('=' .repeat(50));

    const metadata = new grpc.Metadata();
    metadata.set('authorization', `Bearer ${token}`);

    const request = {
      app_id: appId,
      limit: 10
    };

    client.GetLogsByAppId(request, metadata, (error, response) => {
      if (error) {
        console.log(`❌ Error: ${error.message}`);
        resolve(false);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        if (response.success) {
          console.log(`✅ GetLogsByAppId successful (${response.count} logs)`);
          resolve(true);
        } else {
          console.log('❌ GetLogsByAppId failed');
          resolve(false);
        }
      }
    });
  });
}

// Test 5: gRPC GetLogsByAppId without authentication
function testGetLogsByAppIdWithoutAuth(client, appId) {
  return new Promise((resolve) => {
    console.log('\n🚫 Test 5: gRPC GetLogsByAppId (Without Authentication)');
    console.log('=' .repeat(50));

    const request = {
      app_id: appId,
      limit: 10
    };

    client.GetLogsByAppId(request, (error, response) => {
      if (error) {
        console.log(`✅ Correctly rejected: ${error.message}`);
        console.log(`Code: ${error.code} (${error.code === grpc.status.UNAUTHENTICATED ? 'UNAUTHENTICATED' : 'OTHER'})`);
        resolve(error.code === grpc.status.UNAUTHENTICATED);
      } else {
        console.log('❌ Should have been rejected without auth');
        resolve(false);
      }
    });
  });
}

// Test 6: gRPC HealthCheck (public endpoint)
function testHealthCheck(client) {
  return new Promise((resolve) => {
    console.log('\n💚 Test 6: gRPC HealthCheck (Public, No Auth Required)');
    console.log('=' .repeat(50));

    client.HealthCheck({}, (error, response) => {
      if (error) {
        console.log(`❌ Error: ${error.message}`);
        resolve(false);
      } else {
        console.log('Response:', JSON.stringify(response, null, 2));
        console.log('✅ HealthCheck successful (no auth required)');
        resolve(true);
      }
    });
  });
}

// Main test runner
async function runTests() {
  console.log('\n🚀 Starting gRPC Authentication Tests');
  console.log('=' .repeat(50));
  console.log(`gRPC URL: ${GRPC_URL}`);

  let passed = 0;
  let failed = 0;

  try {
    // Setup
    const { token, appId, client } = await setupAuth();

    // Run tests
    if (await testIngestLogsWithAuth(client, token, appId)) { passed++; } else { failed++; }
    if (await testIngestLogsWithoutAuth(client, appId)) { passed++; } else { failed++; }
    if (await testIngestLogsWithInvalidToken(client, appId)) { passed++; } else { failed++; }
    if (await testGetLogsByAppIdWithAuth(client, token, appId)) { passed++; } else { failed++; }
    if (await testGetLogsByAppIdWithoutAuth(client, appId)) { passed++; } else { failed++; }
    if (await testHealthCheck(client)) { passed++; } else { failed++; }

    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Summary');
    console.log('=' .repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total: ${passed + failed}`);

    if (failed === 0) {
      console.log('\n🎉 All gRPC authentication tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Setup error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

