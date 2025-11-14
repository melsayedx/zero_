#!/bin/bash

###############################################################################
# SSL Certificate Setup Script
# Generates self-signed certificates for HTTP/2 and HTTP/3 testing
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
CERT_DIR="./certs"
CERT_FILE="${CERT_DIR}/server.crt"
KEY_FILE="${CERT_DIR}/server.key"
DAYS_VALID=365
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORG="Log Ingestion Platform"
COMMON_NAME="localhost"

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_header "SSL Certificate Setup for HTTP/2 & HTTP/3"

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}❌ OpenSSL is not installed!${NC}"
    echo ""
    echo "Install OpenSSL:"
    echo "  macOS:   brew install openssl"
    echo "  Linux:   apt-get install openssl (Debian/Ubuntu)"
    echo "           yum install openssl (RHEL/CentOS)"
    exit 1
fi

echo -e "${GREEN}✅ OpenSSL is installed ($(openssl version))${NC}"
echo ""

# Create certs directory
mkdir -p "${CERT_DIR}"

# Check if certificates already exist
if [ -f "${CERT_FILE}" ] && [ -f "${KEY_FILE}" ]; then
    echo -e "${YELLOW}⚠️  Certificates already exist!${NC}"
    echo ""
    echo "Existing certificates:"
    echo "  Certificate: ${CERT_FILE}"
    echo "  Private Key: ${KEY_FILE}"
    echo ""
    
    # Show certificate info
    echo "Certificate information:"
    openssl x509 -in "${CERT_FILE}" -noout -subject -dates
    echo ""
    
    read -p "Do you want to regenerate certificates? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificates."
        exit 0
    fi
    
    echo "Removing old certificates..."
    rm -f "${CERT_FILE}" "${KEY_FILE}"
fi

# Generate private key
echo -e "${BLUE}📝 Generating private key...${NC}"
openssl genrsa -out "${KEY_FILE}" 2048

# Generate certificate signing request and self-signed certificate
echo -e "${BLUE}📝 Generating self-signed certificate...${NC}"
openssl req -new -x509 \
    -key "${KEY_FILE}" \
    -out "${CERT_FILE}" \
    -days ${DAYS_VALID} \
    -subj "/C=${COUNTRY}/ST=${STATE}/L=${CITY}/O=${ORG}/CN=${COMMON_NAME}" \
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"

# Set appropriate permissions
chmod 600 "${KEY_FILE}"
chmod 644 "${CERT_FILE}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Certificates Generated Successfully!          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Display certificate information
echo "Certificate Details:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
openssl x509 -in "${CERT_FILE}" -noout -text | grep -A 2 "Subject:"
openssl x509 -in "${CERT_FILE}" -noout -text | grep -A 2 "Validity"
openssl x509 -in "${CERT_FILE}" -noout -text | grep -A 3 "Subject Alternative Name"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Files created:"
echo "  📜 Certificate: ${CERT_FILE}"
echo "  🔑 Private Key: ${KEY_FILE}"
echo ""

echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo ""
echo "1. These are SELF-SIGNED certificates for development/testing only"
echo "2. Browsers will show security warnings - this is expected"
echo "3. For production, use certificates from a trusted CA (Let's Encrypt, etc.)"
echo ""

echo "Using with curl:"
echo "  curl -k https://localhost:3001/health           # HTTP/2"
echo "  curl --http2 -k https://localhost:3001/health   # Force HTTP/2"
echo "  curl --http3 -k https://localhost:3003/health   # HTTP/3"
echo ""

echo "Trusting the certificate (optional for testing):"
echo "  macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${CERT_FILE}"
echo "  Linux:   sudo cp ${CERT_FILE} /usr/local/share/ca-certificates/ && sudo update-ca-certificates"
echo "  Windows: Import ${CERT_FILE} to Trusted Root Certification Authorities"
echo ""

echo "To update .env file (optional):"
echo "  echo 'SSL_CERT_PATH=${CERT_FILE}' >> .env"
echo "  echo 'SSL_KEY_PATH=${KEY_FILE}' >> .env"
echo ""

echo -e "${GREEN}✅ Setup complete! You can now start HTTP/2 and HTTP/3 servers.${NC}"
echo ""

# Add to .gitignore if not already there
if ! grep -q "^certs/" .gitignore 2>/dev/null; then
    echo "certs/" >> .gitignore
    echo -e "${GREEN}✅ Added certs/ to .gitignore${NC}"
fi

