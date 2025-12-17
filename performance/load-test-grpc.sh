#!/bin/bash

###############################################################################
# Performance Testing Script using ghz (gRPC)
# High-performance gRPC load testing for the log ingestion platform
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
SERVER_HOST="${GRPC_HOST:-localhost:50051}"
PROTO_FILE="../proto/logs/logs.proto"
IMPORT_PATH=".."
RESULTS_DIR="./measurements"

# Test Configuration
WARMUP_REQUESTS=100
LIGHT_LOAD=1000
MEDIUM_LOAD=10000
HEAVY_LOAD=100000

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

print_section() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
    echo ""
}

check_ghz() {
    if ! command -v ghz &> /dev/null; then
        echo -e "${RED}ghz is not installed!${NC}"
        echo ""
        echo "Install ghz:"
        echo "  macOS:   brew install ghz"
        echo "  Linux:   Download binary from https://github.com/bojand/ghz/releases"
        exit 1
    fi
    
    echo -e "${GREEN}ghz is installed ($(ghz --version))${NC}"
}

check_server() {
    print_section "Checking connectivity to gRPC server..."
    
    # Simple check using nc just to see if port is open, as curl/ping won't work for gRPC
    local host=$(echo $SERVER_HOST | cut -d: -f1)
    local port=$(echo $SERVER_HOST | cut -d: -f2)
    
    if nc -z "$host" "$port" 2>/dev/null; then
        echo -e "${GREEN}gRPC Server port is open at ${SERVER_HOST}${NC}"
        return 0
    else
        echo -e "${RED}Cannot connect to ${SERVER_HOST}${NC}"
        echo ""
        echo "Start the server with: npm start"
        exit 1
    fi
}

create_results_dir() {
    mkdir -p "${RESULTS_DIR}"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    RESULTS_FILE="${RESULTS_DIR}/test_grpc_${TIMESTAMP}.json"
    echo -e "${CYAN}Results will be saved to: ${RESULTS_FILE}${NC}"
    echo ""
}

check_proto_exists() {
    if [ ! -f "$PROTO_FILE" ]; then
        echo -e "${RED}Proto file not found at ${PROTO_FILE}${NC}"
        echo "Please run this script from the project root"
        exit 1
    fi
}

###############################################################################
# Test Scenarios
###############################################################################

test_health_check() {
    print_header "Test 1: Health Check Endpoint (gRPC)"
    
    echo "Testing health check with high concurrency..."
    echo ""
    
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.HealthCheck \
        --total 1000 \
        --concurrency 50 \
        --format json \
        "$SERVER_HOST" | tee -a "${RESULTS_FILE}"
        
    echo -e "\n${GREEN}Test complete.${NC}"
}

test_single_log_light() {
    print_header "Test 2: Single Log Ingestion - Light Load (gRPC)"
    
    local payload='{
  "logs": [{
    "app_id": "test-app",
    "level": "INFO",
    "message": "Performance test - single log ingestion (gRPC)",
    "source": "ghz-test",
    "environment": "test",
    "metadata": {
      "test_type": "single_log_grpc",
      "load": "light"
    }
  }]
}'

    echo "Testing: ${LIGHT_LOAD} requests with 50 concurrent connections"
    echo ""
    
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total ${LIGHT_LOAD} \
        --concurrency 50 \
        --format summary \
        "$SERVER_HOST"
        
    # Also save detailed results to file
    echo "Saving detailed results..."
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total ${LIGHT_LOAD} \
        --concurrency 50 \
        --format json \
        "$SERVER_HOST" >> "${RESULTS_FILE}"
}

test_single_log_medium() {
    print_header "Test 3: Single Log Ingestion - Medium Load (gRPC)"
    
    local payload='{
  "logs": [{
    "app_id": "api-gateway",
    "level": "INFO",
    "message": "User authentication successful - session created",
    "source": "auth-service",
    "environment": "production",
    "metadata": {
      "user_id": "usr_1234567890",
      "ip_address": "192.168.1.100",
      "session_id": "sess_abcdefghij",
      "duration_ms": "145",
      "protocol": "gRPC"
    }
  }]
}'

    echo "Testing: ${MEDIUM_LOAD} requests with 100 concurrent connections"
    echo ""
    
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total ${MEDIUM_LOAD} \
        --concurrency 100 \
        --format summary \
        "$SERVER_HOST"
        
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total ${MEDIUM_LOAD} \
        --concurrency 100 \
        --format json \
        "$SERVER_HOST" >> "${RESULTS_FILE}"
}

test_single_log_heavy() {
    print_header "Test 4: Single Log Ingestion - Heavy Load (gRPC)"
    
    local payload='{
  "logs": [{
    "app_id": "payment-service",
    "level": "ERROR",
    "message": "Payment processing failed - transaction rolled back",
    "source": "payment-processor",
    "environment": "production",
    "trace_id": "trace-xyz-789",
    "user_id": "user-abc-123",
    "metadata": {
      "transaction_id": "txn_0987654321",
      "amount": "299.99",
      "currency": "USD",
      "payment_method": "credit_card",
      "error_code": "INSUFFICIENT_FUNDS",
      "retry_count": "3",
      "processing_time_ms": "1250",
      "protocol": "gRPC"
    }
  }]
}'

    echo "Testing: ${HEAVY_LOAD} requests with 200 concurrent connections"
    echo ""
    
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total ${HEAVY_LOAD} \
        --concurrency 200 \
        --format summary \
        "$SERVER_HOST"
}

test_batch_ingestion() {
    print_header "Test 5: Batch Ingestion (10 logs per request)"
    
    local payload='{
  "logs": [
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 1", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 2", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 3", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 4", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 5", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 6", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 7", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 8", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 9", "source": "ghz-batch"},
    {"app_id": "batch-test", "level": "INFO", "message": "Batch log 10", "source": "ghz-batch"}
  ]
}'
    
    echo "Testing: 5000 batch requests (50k logs total) with 50 concurrency"
    echo ""
    
    ghz \
        --insecure \
        --proto "$PROTO_FILE" \
        --import-paths "$IMPORT_PATH" \
        --call logs.LogService.IngestLogs \
        --data "$payload" \
        --total 5000 \
        --concurrency 50 \
        --format summary \
        "$SERVER_HOST"
}

###############################################################################
# Test Suites
###############################################################################

run_all_tests() {
    print_header "Running ALL Performance Tests (gRPC)"
    
    test_health_check
    sleep 2
    
    test_single_log_light
    sleep 2
    
    test_single_log_medium
    sleep 2
    
    test_batch_ingestion
    sleep 2
    
    # Heavy load last (optional)
    read -p "Run heavy load test (100k requests)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_single_log_heavy
    fi
}

run_quick_tests() {
    print_header "Running Quick Performance Tests (gRPC)"
    
    test_health_check
    sleep 2
    
    test_single_log_light
}

###############################################################################
# Main Menu
###############################################################################

show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Log Ingestion Platform - Performance Testing        ║${NC}"
    echo -e "${CYAN}║                  Using ghz (gRPC)                        ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Target Host: ${YELLOW}${SERVER_HOST}${NC}"
    echo ""
    echo "Select a test suite:"
    echo ""
    echo "  1) Health Check Only"
    echo "  2) Single Log - Light Load (1k requests)"
    echo "  3) Single Log - Medium Load (10k requests)"
    echo "  4) Single Log - Heavy Load (100k requests)"
    echo "  5) Batch Ingestion Test (10 logs/req)"
    echo ""
    echo "  9) Quick Test Suite (health + light)"
    echo " 10) All Tests (comprehensive)"
    echo ""
    echo "  c) Configure Target Host (Currently: ${SERVER_HOST})"
    echo "  0) Exit"
    echo ""
}

main() {
    # Pre-flight checks
    check_ghz
    check_proto_exists
    create_results_dir
    
    # Show menu if no arguments
    if [ $# -eq 0 ]; then
        while true; do
            show_menu
            read -p "Enter choice [0-10, c]: " choice
            
            case $choice in
                c|C)
                    read -p "Enter target host (e.g. localhost:50051): " new_host
                    if [[ -n "$new_host" ]]; then
                        SERVER_HOST="$new_host"
                        # Re-verify server
                        check_server
                    fi
                    continue
                    ;;
                0) echo "Exiting..."; exit 0 ;;
                *) break ;;
            esac
        done
    else
        choice=$1
    fi
    
    # Check server before running tests
    check_server
    
    case $choice in
        1) test_health_check ;;
        2) test_single_log_light ;;
        3) test_single_log_medium ;;
        4) test_single_log_heavy ;;
        5) test_batch_ingestion ;;
        9) run_quick_tests ;;
        10) run_all_tests ;;
        0) echo "Exiting..."; exit 0 ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              Performance Test Complete!                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Results saved to: ${CYAN}${RESULTS_FILE}${NC}"
    echo ""
}

# Run main function
main "$@"
