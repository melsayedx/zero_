const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * HTTP/3 Server Adapter
 * 
 * HTTP/3 uses QUIC protocol which is not natively supported in Node.js yet.
 * This implementation uses Caddy as a reverse proxy to provide HTTP/3 support.
 * 
 * Alternative approaches:
 * 1. Use Caddy/nginx reverse proxy (RECOMMENDED - Production Ready)
 * 2. Use experimental Node.js QUIC implementations (not stable)
 * 3. Wait for native Node.js HTTP/3 support
 */

/**
 * Start Caddy reverse proxy for HTTP/3
 * @param {Object} options - Configuration options
 * @returns {Object} - Caddy process and control functions
 */
function startHttp3Proxy(options = {}) {
  const {
    port = 3003,
    backendPort = 3000,
    certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '../../../certs/server.crt'),
    keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '../../../certs/server.key'),
    caddyConfigPath = path.join(__dirname, '../../../config/Caddyfile')
  } = options;

  // Check if Caddy is installed
  const caddyCheck = spawn('which', ['caddy']);
  
  return new Promise((resolve, reject) => {
    caddyCheck.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          'Caddy is not installed. Install it:\n' +
          '  macOS:   brew install caddy\n' +
          '  Linux:   https://caddyserver.com/docs/install\n' +
          '  Docker:  Use caddy:alpine image'
        ));
      }

      // Generate Caddyfile if it doesn't exist
      if (!fs.existsSync(caddyConfigPath)) {
        const caddyConfig = generateCaddyfile(port, backendPort, certPath, keyPath);
        fs.mkdirSync(path.dirname(caddyConfigPath), { recursive: true });
        fs.writeFileSync(caddyConfigPath, caddyConfig);
        console.log(`Generated Caddyfile at: ${caddyConfigPath}`);
      }

      // Start Caddy
      const caddy = spawn('caddy', ['run', '--config', caddyConfigPath, '--adapter', 'caddyfile'], {
        stdio: 'pipe'
      });

      let started = false;

      caddy.stdout.on('data', (data) => {
        const message = data.toString();
        console.log(`[Caddy] ${message.trim()}`);
        
        if (!started && message.includes('serving')) {
          started = true;
          resolve({
            process: caddy,
            port,
            stop: () => stopCaddy(caddy)
          });
        }
      });

      caddy.stderr.on('data', (data) => {
        console.error(`[Caddy Error] ${data.toString().trim()}`);
      });

      caddy.on('error', (error) => {
        reject(new Error(`Failed to start Caddy: ${error.message}`));
      });

      caddy.on('close', (code) => {
        if (code !== 0 && !started) {
          reject(new Error(`Caddy exited with code ${code}`));
        }
      });

      // Timeout if Caddy doesn't start
      setTimeout(() => {
        if (!started) {
          caddy.kill();
          reject(new Error('Caddy failed to start within 10 seconds'));
        }
      }, 10000);
    });
  });
}

/**
 * Generate Caddyfile configuration
 */
function generateCaddyfile(port, backendPort, certPath, keyPath) {
  return `
# Caddyfile for HTTP/3 Reverse Proxy
# Generated automatically for log ingestion platform

{
    # Global options
    admin off
    auto_https off
    log {
        output stdout
        format console
        level INFO
    }
}

:${port} {
    # Enable HTTP/3 (QUIC)
    protocols h3 h2 h1
    
    # TLS configuration
    tls ${certPath} ${keyPath}
    
    # Reverse proxy to backend
    reverse_proxy localhost:${backendPort} {
        # Health checks
        health_uri /health
        health_interval 10s
        health_timeout 5s
        
        # Headers
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Port {server_port}
        
        # Compression is handled by backend
        header_down -Server
    }
    
    # Logging
    log {
        output stdout
        format console
    }
    
    # CORS headers (optional)
    header {
        # Access-Control-Allow-Origin *
        # Access-Control-Allow-Methods "GET, POST, OPTIONS"
        # Access-Control-Allow-Headers "Content-Type, Authorization"
        
        # Security headers
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        
        # HTTP/3 Advertisement
        Alt-Svc "h3=\\":${port}\\"; ma=86400"
    }
}
`;
}

/**
 * Stop Caddy process gracefully
 */
function stopCaddy(caddyProcess) {
  return new Promise((resolve) => {
    if (!caddyProcess || caddyProcess.killed) {
      resolve();
      return;
    }

    console.log('Stopping Caddy...');
    
    caddyProcess.on('close', () => {
      console.log('Caddy stopped');
      resolve();
    });

    // Try graceful shutdown first
    caddyProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds
    setTimeout(() => {
      if (!caddyProcess.killed) {
        caddyProcess.kill('SIGKILL');
      }
    }, 5000);
  });
}

/**
 * Alternative: Generate Docker Compose configuration for HTTP/3
 */
function generateDockerComposeHttp3() {
  return `
# Docker Compose configuration for HTTP/3 support
version: '3.8'

services:
  caddy-http3:
    image: caddy:2-alpine
    ports:
      - "3003:3003/udp"  # HTTP/3 (QUIC)
      - "3003:3003/tcp"  # HTTP/2 fallback
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs:/certs:ro
    networks:
      - app-network
    depends_on:
      - app
    restart: unless-stopped

  app:
    build: .
    ports:
      - "3000:3000"
    networks:
      - app-network
    environment:
      - NODE_ENV=production

networks:
  app-network:
    driver: bridge
`;
}

module.exports = {
  startHttp3Proxy,
  generateCaddyfile,
  generateDockerComposeHttp3
};

