#!/bin/bash

###############################################################################
# HTTP/2 Performance Testing Script
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="${SERVER_URL:-https://localhost:3001}"
RESULTS_DIR="./performance-results"

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  $1${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_tools() {
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}❌ curl is not installed!${NC}"
        exit 1
    fi
    
    if ! curl --version | grep -q "HTTP2"; then
        echo -e "${RED}❌ curl does not support HTTP/2!${NC}"
        echo "  Upgrade curl: brew install curl (macOS)"
        exit 1
    fi
    
    echo -e "${GREEN}✅ curl with HTTP/2 support installed${NC}"
}

check_server() {
    if curl -s -k -f "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HTTP/2 server running at ${BASE_URL}${NC}"
        local version=$(curl -k -s -o /dev/null -w "%{http_version}" "${BASE_URL}/health")
        echo -e "${CYAN}   HTTP Version: ${version}${NC}"
    else
        echo -e "${RED}❌ HTTP/2 server not running at ${BASE_URL}${NC}"
        echo "Start: npm run start:http2"
        exit 1
    fi
}

test_health_check() {
    print_header "Test 1: Health Check (HTTP/2)"
    
    local total=100
    local success=0
    local start=$(date +%s.%N)
    
    for i in $(seq 1 $total); do
        if curl -k -s --http2 -o /dev/null -w "%{http_code}" "${BASE_URL}/health" | grep -q "200"; then
            ((success++))
        fi
    done
    
    local end=$(date +%s.%N)
    local duration=$(echo "$end - $start" | bc)
    local rps=$(echo "scale=2; $total / $duration" | bc)
    
    echo "Results:"
    echo "  Total: $total"
    echo "  Success: $success"
    echo "  Duration: ${duration}s"
    echo "  RPS: ${rps}"
}

test_single_log() {
    print_header "Test 2: Single Log Ingestion (HTTP/2)"
    
    local payload='{"app_id":"http2-test","level":"INFO","message":"HTTP/2 test","source":"test"}'
    
    echo "Testing log ingestion..."
    curl -k --http2 -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\nHTTP: %{http_code} | Time: %{time_total}s\n" \
        "${BASE_URL}/api/logs"
}

test_comparison() {
    print_header "Test 3: HTTP/1.1 vs HTTP/2"
    
    local requests=50
    
    echo "Testing HTTP/1.1..."
    local start=$(date +%s.%N)
    for i in $(seq 1 $requests); do
        curl -k -s --http1.1 -o /dev/null "${BASE_URL}/health"
    done
    local http1_time=$(echo "$(date +%s.%N) - $start" | bc)
    
    echo "Testing HTTP/2..."
    start=$(date +%s.%N)
    for i in $(seq 1 $requests); do
        curl -k -s --http2 -o /dev/null "${BASE_URL}/health"
    done
    local http2_time=$(echo "$(date +%s.%N) - $start" | bc)
    
    echo ""
    echo "Results:"
    echo "  HTTP/1.1: ${http1_time}s"
    echo "  HTTP/2:   ${http2_time}s"
}

show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Log Ingestion - HTTP/2 Testing                      ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  1) Health Check"
    echo "  2) Single Log"
    echo "  3) HTTP/1.1 vs HTTP/2"
    echo "  4) All Tests"
    echo "  0) Exit"
    echo ""
}

main() {
    check_tools
    check_server
    
    mkdir -p "${RESULTS_DIR}"
    
    if [ $# -eq 0 ]; then
        show_menu
        read -p "Choice [0-4]: " choice
    else
        choice=$1
    fi
    
    case $choice in
        1) test_health_check ;;
        2) test_single_log ;;
        3) test_comparison ;;
        4) test_health_check; test_single_log; test_comparison ;;
        0) exit 0 ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
    
    echo ""
    echo -e "${GREEN}Test Complete!${NC}"
}

main "$@"
