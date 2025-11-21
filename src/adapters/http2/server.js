const http2 = require('http2');
const fs = require('fs');
const path = require('path');

/**
 * HTTP/2 Server Adapter
 * Wraps Fastify app to work with HTTP/2 (with HTTPS)
 */

/**
 * Create HTTP/2 server with Fastify app
 * @param {FastifyInstance} app - Fastify application instance
 * @param {Object} options - Server options
 * @returns {http2.Http2SecureServer}
 */
function createHttp2Server(app, options = {}) {
  const {
    port = 3001,
    certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../../../certs/server.crt'),
    keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '../../../certs/server.key'),
    onListen = null
  } = options;

  // Check if certificates exist
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(`SSL certificates not found. Run: npm run setup:certs\nExpected files:\n  - ${certPath}\n  - ${keyPath}`);
  }

  // Load SSL certificates
  const serverOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    allowHTTP1: true // Enable HTTP/1.1 fallback
  };

  // Create HTTP/2 secure server
  const server = http2.createSecureServer(serverOptions);

  // Handle HTTP/2 streams and convert to Express-compatible req/res
  server.on('stream', (stream, headers) => {
    // Convert HTTP/2 headers to HTTP/1.1 format
    const method = headers[':method'];
    const path = headers[':path'];
    const scheme = headers[':scheme'];
    const authority = headers[':authority'];

    // Create pseudo request object
    const req = Object.assign(stream, {
      httpVersion: '2.0',
      httpVersionMajor: 2,
      httpVersionMinor: 0,
      method,
      url: path,
      path,
      headers: convertHttp2Headers(headers),
      socket: stream.session.socket,
      connection: stream.session.socket,
      // Additional properties for Express
      query: {},
      params: {},
      body: null,
      _read() {}
    });

    // Create pseudo response object
    const res = Object.assign(stream, {
      statusCode: 200,
      statusMessage: 'OK',
      headersSent: false,
      _headers: {},
      
      // Express-compatible methods
      status(code) {
        this.statusCode = code;
        return this;
      },
      
      json(data) {
        const json = JSON.stringify(data);
        this.setHeader('content-type', 'application/json');
        this.setHeader('content-length', Buffer.byteLength(json));
        this.writeHead(this.statusCode);
        this.end(json);
        return this;
      },
      
      send(data) {
        if (typeof data === 'object') {
          return this.json(data);
        }
        this.setHeader('content-type', 'text/plain');
        this.setHeader('content-length', Buffer.byteLength(data));
        this.writeHead(this.statusCode);
        this.end(data);
        return this;
      },
      
      setHeader(name, value) {
        this._headers[name.toLowerCase()] = value;
        return this;
      },
      
      getHeader(name) {
        return this._headers[name.toLowerCase()];
      },
      
      writeHead(statusCode, headers) {
        const http2Headers = {
          ':status': statusCode
        };
        
        // Merge stored headers
        Object.keys(this._headers).forEach(key => {
          http2Headers[key] = this._headers[key];
        });
        
        // Merge additional headers
        if (headers) {
          Object.keys(headers).forEach(key => {
            http2Headers[key.toLowerCase()] = headers[key];
          });
        }
        
        stream.respond(http2Headers);
        this.headersSent = true;
        return this;
      }
    });

    // Handle request body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let body = [];
      
      stream.on('data', chunk => {
        body.push(chunk);
      });
      
      stream.on('end', () => {
        req.body = Buffer.concat(body);
        // Let Express middleware handle body parsing
        handleRequest(app, req, res);
      });
      
      stream.on('error', err => {
        console.error('HTTP/2 stream error:', err);
      });
    } else {
      handleRequest(app, req, res);
    }
  });

  // Start listening
  server.listen(port, () => {
    if (onListen) {
      onListen(port);
    } else {
      console.log(`HTTP/2 server listening on https://localhost:${port}`);
    }
  });

  return server;
}

/**
 * Convert HTTP/2 headers to HTTP/1.1 format
 */
function convertHttp2Headers(http2Headers) {
  const headers = {};
  
  for (const [key, value] of Object.entries(http2Headers)) {
    // Skip pseudo-headers (they start with :)
    if (key.startsWith(':')) {
      continue;
    }
    headers[key] = value;
  }
  
  return headers;
}

/**
 * Handle request through Fastify app
 */
function handleRequest(app, req, res) {
  try {
    app(req, res);
  } catch (error) {
    console.error('Error handling HTTP/2 request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

/**
 * Create HTTP/2 clear text server (for testing, not recommended for production)
 */
function createHttp2ClearTextServer(app, options = {}) {
  const { port = 3002, onListen = null } = options;
  
  const server = http2.createServer();
  
  server.on('stream', (stream, headers) => {
    const method = headers[':method'];
    const path = headers[':path'];

    const req = Object.assign(stream, {
      httpVersion: '2.0',
      method,
      url: path,
      headers: convertHttp2Headers(headers),
      socket: stream.session.socket,
      connection: stream.session.socket
    });

    const res = Object.assign(stream, {
      statusCode: 200,
      _headers: {},
      
      status(code) {
        this.statusCode = code;
        return this;
      },
      
      json(data) {
        const json = JSON.stringify(data);
        this.setHeader('content-type', 'application/json');
        this.setHeader('content-length', Buffer.byteLength(json));
        this.writeHead(this.statusCode);
        this.end(json);
        return this;
      },
      
      setHeader(name, value) {
        this._headers[name.toLowerCase()] = value;
        return this;
      },
      
      writeHead(statusCode) {
        const headers = { ':status': statusCode, ...this._headers };
        stream.respond(headers);
        this.headersSent = true;
        return this;
      }
    });

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let body = [];
      stream.on('data', chunk => body.push(chunk));
      stream.on('end', () => {
        req.body = Buffer.concat(body);
        handleRequest(app, req, res);
      });
    } else {
      handleRequest(app, req, res);
    }
  });

  server.listen(port, () => {
    if (onListen) {
      onListen(port);
    } else {
      console.log(`HTTP/2 (cleartext) server listening on http://localhost:${port}`);
    }
  });

  return server;
}

module.exports = {
  createHttp2Server,
  createHttp2ClearTextServer
};

