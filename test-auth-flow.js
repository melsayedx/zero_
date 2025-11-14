/**
 * Test script for HTTP Authentication Flow
 * Tests user registration, login, app creation, and protected endpoints
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsedBody });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test functions
async function testRegister() {
  console.log('\n📝 Test 1: Register User');
  console.log('=' .repeat(50));

  const email = `test_${Date.now()}@example.com`;
  const password = 'TestPass123';

  try {
    const response = await makeRequest('POST', '/api/auth/register', {
      email,
      password
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 201 && response.body.success) {
      console.log('✅ Registration successful');
      return { email, password, user_id: response.body.user.user_id };
    } else {
      console.log('❌ Registration failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function testLogin(email, password) {
  console.log('\n🔐 Test 2: Login User');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('POST', '/api/auth/login', {
      email,
      password
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 200 && response.body.success) {
      console.log('✅ Login successful');
      console.log(`Token: ${response.body.token.substring(0, 50)}...`);
      return response.body.token;
    } else {
      console.log('❌ Login failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function testGetMe(token) {
  console.log('\n👤 Test 3: Get Current User Info');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${token}`
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 200 && response.body.success) {
      console.log('✅ Get user info successful');
      return true;
    } else {
      console.log('❌ Get user info failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testCreateApp(token) {
  console.log('\n📱 Test 4: Create App');
  console.log('=' .repeat(50));

  const appName = `Test App ${Date.now()}`;

  try {
    const response = await makeRequest('POST', '/api/apps', {
      app_name: appName
    }, {
      'Authorization': `Bearer ${token}`
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 201 && response.body.success) {
      console.log('✅ App created successfully');
      return response.body.app.app_id;
    } else {
      console.log('❌ App creation failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function testListApps(token) {
  console.log('\n📋 Test 5: List User Apps');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('GET', '/api/apps', null, {
      'Authorization': `Bearer ${token}`
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 200 && response.body.success) {
      console.log(`✅ Listed ${response.body.count} apps`);
      return true;
    } else {
      console.log('❌ List apps failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testIngestLog(token, appId) {
  console.log('\n📝 Test 6: Ingest Log (Protected Endpoint)');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('POST', '/api/logs', {
      app_id: appId,
      level: 'INFO',
      message: 'Test log message from authentication test',
      source: 'test-script',
      environment: 'development',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    }, {
      'Authorization': `Bearer ${token}`
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 201 && response.body.success) {
      console.log('✅ Log ingestion successful');
      return true;
    } else {
      console.log('❌ Log ingestion failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testGetLogs(token, appId) {
  console.log('\n🔍 Test 7: Get Logs (Protected Endpoint)');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('GET', `/api/logs/${appId}?limit=10`, null, {
      'Authorization': `Bearer ${token}`
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 200 && response.body.success) {
      console.log(`✅ Retrieved ${response.body.count} logs`);
      return true;
    } else {
      console.log('❌ Get logs failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testUnauthorizedAccess() {
  console.log('\n🚫 Test 8: Unauthorized Access (No Token)');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('GET', '/api/apps');

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 401) {
      console.log('✅ Correctly rejected unauthorized request');
      return true;
    } else {
      console.log('❌ Should have returned 401 Unauthorized');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testInvalidToken() {
  console.log('\n🚫 Test 9: Invalid Token');
  console.log('=' .repeat(50));

  try {
    const response = await makeRequest('GET', '/api/apps', null, {
      'Authorization': 'Bearer invalid-token-here'
    });

    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));

    if (response.status === 401) {
      console.log('✅ Correctly rejected invalid token');
      return true;
    } else {
      console.log('❌ Should have returned 401 Unauthorized');
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('\n🚀 Starting Authentication Flow Tests');
  console.log('=' .repeat(50));
  console.log(`Base URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Test 1: Register
  const user = await testRegister();
  if (!user) {
    console.log('\n❌ Cannot continue tests without registration');
    process.exit(1);
  }
  passed++;

  // Test 2: Login
  const token = await testLogin(user.email, user.password);
  if (!token) {
    console.log('\n❌ Cannot continue tests without token');
    failed++;
    process.exit(1);
  }
  passed++;

  // Test 3: Get Me
  if (await testGetMe(token)) { passed++; } else { failed++; }

  // Test 4: Create App
  const appId = await testCreateApp(token);
  if (!appId) {
    console.log('\n❌ Cannot continue tests without app_id');
    failed++;
    process.exit(1);
  }
  passed++;

  // Test 5: List Apps
  if (await testListApps(token)) { passed++; } else { failed++; }

  // Test 6: Ingest Log
  if (await testIngestLog(token, appId)) { passed++; } else { failed++; }

  // Test 7: Get Logs
  if (await testGetLogs(token, appId)) { passed++; } else { failed++; }

  // Test 8: Unauthorized Access
  if (await testUnauthorizedAccess()) { passed++; } else { failed++; }

  // Test 9: Invalid Token
  if (await testInvalidToken()) { passed++; } else { failed++; }

  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Test Summary');
  console.log('=' .repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

