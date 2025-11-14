#!/bin/bash

###############################################################################
# HTTP/3 Performance Testing Script
# HTTP/3 load testing for the log ingestion platform
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${SERVER_URL:-https://localhost:3003}"
RESULTS_DIR="./performance-results"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  $1${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_tools() {
    echo -e "${BLUE}Checking required tools...${NC}"
    echo ""
    
    # Check for curl with HTTP/3 support
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}❌ curl is not installed!${NC}"
        exit 1
    fi
    
    # Check if curl supports HTTP/3
    if ! curl --version | grep -q "HTTP3"; then
        echo -e "${YELLOW}⚠️  Your curl doesn't support HTTP/3${NC}"
        echo ""
        echo "To install curl with HTTP/3 support:"
        echo "  macOS:   brew install curl-openssl (or build from source)"
        echo "  Linux:   Build curl with nghttp3 support"
        echo ""
        echo "Falling back to HTTP/2 for testing..."
        HTTP3_SUPPORTED=0
    else
        echo -e "${GREEN}✅ curl with HTTP/3 support installed${NC}"
        HTTP3_SUPPORTED=1
    fi
}

check_server() {
    echo -e "${BLUE}Checking if HTTP/3 proxy is running...${NC}"
    
    # Use -k to ignore self-signed certificate warnings
    if curl -k -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HTTP/3 proxy is running at ${BASE_URL}${NC}"
        return 0
    else
        echo -e "${RED}❌ HTTP/3 proxy is not running at ${BASE_URL}${NC}"
        echo ""
        echo "Start the HTTP/3 server with: npm run start:http3"
        exit 1
    fi
}

create_results_dir() {
    mkdir -p "${RESULTS_DIR}"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    RESULTS_FILE="${RESULTS_DIR}/http3_test_${TIMESTAMP}.txt"
    echo -e "${CYAN}📊 Results will be saved to: ${RESULTS_FILE}${NC}"
    echo ""
}

###############################################################################
# Test Scenarios
###############################################################################

test_health_check() {
    print_header "Test 1: Health Check via HTTP/3"
    
    echo "Testing health endpoint..."
    echo ""
    
    if [ $HTTP3_SUPPORTED -eq 1 ]; then
        curl -k --http3 -v "${BASE_URL}/health" 2>&1 | tee -a "${RESULTS_FILE}"
    else
        curl -k --http2 -v "${BASE_URL}/health" 2>&1 | tee -a "${RESULTS_FILE}"
    fi
    
    echo ""
}

test_single_log() {
    print_header "Test 2: Single Log Ingestion via HTTP/3"
    
    local payload='{
  "app_id": "test-app-http3",
  "level": "INFO",
  "message": "Performance test - HTTP/3 log ingestion",
  "source": "http3-test",
  "environment": "test",
  "metadata": {
    "test_type": "single_log",
    "protocol": "http3"
  }
}'

    echo "Testing log ingestion..."
    echo "Payload size: $(echo -n "$payload" | wc -c) bytes"
    echo ""
    
    if [ $HTTP3_SUPPORTED -eq 1 ]; then
        curl -k --http3 -X POST \
            -H "Content-Type: application/json" \
            -d "$payload" \
            -w "\nHTTP Code: %{http_code}\nTime: %{time_total}s\n" \
            "${BASE_URL}/api/logs" 2>&1 | tee -a "${RESULTS_FILE}"
    else
        curl -k --http2 -X POST \
            -H "Content-Type: application/json" \
            -d "$payload" \
            -w "\nHTTP Code: %{http_code}\nTime: %{time_total}s\n" \
            "${BASE_URL}/api/logs" 2>&1 | tee -a "${RESULTS_FILE}"
    fi
    
    echo ""
}

test_protocol_negotiation() {
    print_header "Test 3: Protocol Negotiation Test"
    
    echo "Testing Alt-Svc header and protocol negotiation..."
    echo ""
    
    # First request - should get Alt-Svc header
    echo "Request 1: Initial connection (HTTP/2)"
    curl -k -s -D - "${BASE_URL}/health" 2>&1 | grep -i "alt-svc" | tee -a "${RESULTS_FILE}"
    
    echo ""
    echo "Request 2: Following Alt-Svc (HTTP/3)"
    if [ $HTTP3_SUPPORTED -eq 1 ]; then
        curl -k --http3 -v "${BASE_URL}/health" 2>&1 | grep -i "using HTTP" | tee -a "${RESULTS_FILE}"
    fi
    
    echo ""
}

test_0rtt() {
    if [ $HTTP3_SUPPORTED -eq 0 ]; then
        echo -e "${YELLOW}Skipping 0-RTT test (HTTP/3 not supported)${NC}"
        return
    fi
    
    print_header "Test 4: 0-RTT Connection Resumption"
    
    echo "Testing 0-RTT (connection resumption)..."
    echo ""
    echo "First connection (establishing session)..."
    
    curl -k --http3 -w "Time: %{time_total}s\n" "${BASE_URL}/health" -o /dev/null 2>&1 | tee -a "${RESULTS_FILE}"
    
    sleep 1
    
    echo ""
    echo "Second connection (should use 0-RTT if supported)..."
    curl -k --http3 -w "Time: %{time_total}s\n" "${BASE_URL}/health" -o /dev/null 2>&1 | tee -a "${RESULTS_FILE}"
    
    echo ""
}

test_comparison() {
    print_header "Test 5: HTTP/2 vs HTTP/3 Comparison"
    
    local requests=50
    
    # Test HTTP/2
    echo "Testing HTTP/2..."
    local start=$(date +%s.%N)
    for i in $(seq 1 $requests); do
        curl -k -s --http2 -o /dev/null "${BASE_URL}/health"
    done
    local end=$(date +%s.%N)
    local http2_time=$(echo "$end - $start" | bc)
    
    echo "HTTP/2 Time: ${http2_time}s"
    
    # Test HTTP/3 (if supported)
    if [ $HTTP3_SUPPORTED -eq 1 ]; then
        echo "Testing HTTP/3..."
        start=$(date +%s.%N)
        for i in $(seq 1 $requests); do
            curl -k -s --http3 -o /dev/null "${BASE_URL}/health"
        done
        end=$(date +%s.%N)
        local http3_time=$(echo "$end - $start" | bc)
        
        echo "HTTP/3 Time: ${http3_time}s"
        echo ""
        
        # Calculate improvement
        local improvement=$(echo "scale=2; (($http2_time - $http3_time) / $http2_time) * 100" | bc)
        
        echo "Comparison Results:" | tee -a "${RESULTS_FILE}"
        echo "  HTTP/2: ${http2_time}s" | tee -a "${RESULTS_FILE}"
        echo "  HTTP/3: ${http3_time}s" | tee -a "${RESULTS_FILE}"
        echo "  Improvement: ${improvement}%" | tee -a "${RESULTS_FILE}"
    else
        echo -e "${YELLOW}HTTP/3 not supported, skipping comparison${NC}"
    fi
    
    echo "" | tee -a "${RESULTS_FILE}"
}

###############################################################################
# Test Suites
###############################################################################

run_all_tests() {
    print_header "Running ALL HTTP/3 Tests"
    
    test_health_check
    sleep 2
    
    test_single_log
    sleep 2
    
    test_protocol_negotiation
    sleep 2
    
    test_0rtt
    sleep 2
    
    test_comparison
}

run_quick_tests() {
    print_header "Running Quick HTTP/3 Tests"
    
    test_health_check
    sleep 2
    
    test_single_log
}

###############################################################################
# Main Menu
###############################################################################

show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Log Ingestion Platform - HTTP/3 Testing             ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Select a test:"
    echo ""
    echo "  1) Health Check"
    echo "  2) Single Log Ingestion"
    echo "  3) Protocol Negotiation"
    echo "  4) 0-RTT Connection Test"
    echo "  5) HTTP/2 vs HTTP/3 Comparison"
    echo ""
    echo "  6) Quick Test Suite"
    echo "  7) All Tests"
    echo ""
    echo "  0) Exit"
    echo ""
}

###############################################################################
# Main Script
###############################################################################

main() {
    # Pre-flight checks
    check_tools
    check_server
    create_results_dir
    
    # Show menu if no arguments
    if [ $# -eq 0 ]; then
        show_menu
        read -p "Enter choice [0-7]: " choice
    else
        choice=$1
    fi
    
    case $choice in
        1) test_health_check ;;
        2) test_single_log ;;
        3) test_protocol_negotiation ;;
        4) test_0rtt ;;
        5) test_comparison ;;
        6) run_quick_tests ;;
        7) run_all_tests ;;
        0) echo "Exiting..."; exit 0 ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         HTTP/3 Performance Test Complete!                ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Results saved to: ${CYAN}${RESULTS_FILE}${NC}"
    echo ""
}

# Run main function
main "$@"

