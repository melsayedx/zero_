#!/bin/bash

###############################################################################
# Performance Testing Script using oha
# High-performance HTTP load testing for the log ingestion platform
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
BASE_URL="${SERVER_URL:-http://localhost:3000}"
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

check_oha() {
    if ! command -v oha &> /dev/null; then
        echo -e "${RED}oha is not installed!${NC}"
        echo ""
        echo "Install oha:"
        echo "  macOS:   brew install oha"
        echo "  Linux:   cargo install oha"
        echo "  Other:   https://github.com/hatoo/oha"
        exit 1
    fi
    
    echo -e "${GREEN}oha is installed ($(oha --version))${NC}"
}

check_server() {
    print_section "Checking if server is running..."
    
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}Server is running at ${BASE_URL}${NC}"
        return 0
    else
        echo -e "${RED}Server is not running at ${BASE_URL}${NC}"
        echo ""
        echo "Start the server with: npm start"
        exit 1
    fi
}

create_results_dir() {
    mkdir -p "${RESULTS_DIR}"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    RESULTS_FILE="${RESULTS_DIR}/test_${TIMESTAMP}.txt"
    echo -e "${CYAN}Results will be saved to: ${RESULTS_FILE}${NC}"
    echo ""
}

###############################################################################
# Test Scenarios
###############################################################################

test_health_check() {
    print_header "Test 1: Health Check Endpoint"
    
    echo "Testing health check with high concurrency..."
    echo ""
    
    oha -z 10s \
        -c 100 \
        --latency-correction \
        --disable-keepalive \
        "${BASE_URL}/health" | tee -a "${RESULTS_FILE}"
}

test_single_log_light() {
    print_header "Test 2: Single Log Ingestion - Light Load"
    
    local payload='{
  "app_id": "test-app",
  "level": "INFO",
  "message": "Performance test - single log ingestion",
  "source": "oha-test",
  "environment": "test",
  "metadata": {
    "test_type": "single_log",
    "load": "light"
  }
}'

    echo "Testing: ${LIGHT_LOAD} requests with 50 concurrent connections"
    echo "Payload size: $(echo -n "$payload" | wc -c) bytes"
    echo ""
    
    oha -n ${LIGHT_LOAD} \
        -c 50 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_single_log_medium() {
    print_header "Test 3: Single Log Ingestion - Medium Load"
    
    local payload='{
  "app_id": "api-gateway",
  "level": "INFO",
  "message": "User authentication successful - session created",
  "source": "auth-service",
  "environment": "production",
  "metadata": {
    "user_id": "usr_1234567890",
    "ip_address": "192.168.1.100",
    "session_id": "sess_abcdefghij",
    "duration_ms": 145
  }
}'

    echo "Testing: ${MEDIUM_LOAD} requests with 100 concurrent connections"
    echo "Payload size: $(echo -n "$payload" | wc -c) bytes"
    echo ""
    
    oha -n ${MEDIUM_LOAD} \
        -c 100 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_single_log_heavy() {
    print_header "Test 4: Single Log Ingestion - Heavy Load"
    
    local payload='{
  "app_id": "payment-service",
  "level": "ERROR",
  "message": "Payment processing failed - transaction rolled back",
  "source": "payment-processor",
  "environment": "production",
  "trace_id": "trace-xyz-789",
  "user_id": "user-abc-123",
  "metadata": {
    "transaction_id": "txn_0987654321",
    "amount": 299.99,
    "currency": "USD",
    "payment_method": "credit_card",
    "error_code": "INSUFFICIENT_FUNDS",
    "retry_count": 3,
    "processing_time_ms": 1250
  }
}'

    echo "Testing: ${HEAVY_LOAD} requests with 200 concurrent connections"
    echo "Payload size: $(echo -n "$payload" | wc -c) bytes"
    echo ""
    
    oha -n ${HEAVY_LOAD} \
        -c 200 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_duration_based() {
    print_header "Test 5: Duration-Based Test (30 seconds)"
    
    local payload='{
  "app_id": "notification-service",
  "level": "INFO",
  "message": "Email notification sent successfully",
  "source": "email-worker",
  "environment": "production"
}'

    echo "Testing: 30 seconds sustained load with 100 concurrent connections"
    echo "Target: Maximum throughput for 30 seconds"
    echo ""
    
    oha -z 30s \
        -c 100 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_burst_load() {
    print_header "Test 6: Burst Load Test"
    
    local payload='{
  "app_id": "api-gateway",
  "level": "WARN",
  "message": "Rate limit warning - approaching threshold",
  "source": "rate-limiter",
  "environment": "production"
}'

    echo "Testing: Short burst with 500 concurrent connections"
    echo "Simulating traffic spike scenario"
    echo ""
    
    oha -n 5000 \
        -c 500 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        --disable-keepalive \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_query_performance() {
    print_header "Test 7: Log Query/Retrieval Performance"
    
    echo "Testing: Query logs by app_id"
    echo "Endpoint: GET /api/logs/test-app?limit=100"
    echo ""
    
    oha -n 1000 \
        -c 50 \
        --latency-correction \
        "${BASE_URL}/api/logs/test-app?limit=100" | tee -a "${RESULTS_FILE}"
}

test_large_payload() {
    print_header "Test 8: Large Payload Test"
    
    local payload='{
  "app_id": "analytics-service",
  "level": "INFO",
  "message": "Large analytics event processed with extensive metadata",
  "source": "analytics-pipeline",
  "environment": "production",
  "metadata": {
    "event_type": "page_view",
    "session_id": "sess_1234567890abcdefghijklmnopqrstuvwxyz",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "referrer": "https://example.com/previous-page?query=test&param=value",
    "page_url": "https://example.com/current-page?id=123&category=tech&sort=latest",
    "screen_resolution": "1920x1080",
    "viewport_size": "1440x900",
    "device_type": "desktop",
    "browser": "Chrome",
    "browser_version": "119.0.0.0",
    "os": "macOS",
    "os_version": "14.1",
    "country": "US",
    "region": "California",
    "city": "San Francisco",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "timezone": "America/Los_Angeles",
    "custom_dimensions": {
      "dimension1": "value1",
      "dimension2": "value2",
      "dimension3": "value3",
      "dimension4": "value4",
      "dimension5": "value5"
    }
  }
}'

    echo "Testing: Large payload (~1.5KB per request)"
    echo "Payload size: $(echo -n "$payload" | wc -c) bytes"
    echo ""
    
    oha -n 5000 \
        -c 100 \
        -m POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

test_idempotency() {
    print_header "Test 9: Idempotency Test"
    
    local key="test-idempotency-$(date +%s)"
    local payload='{
  "app_id": "idempotency-test",
  "level": "INFO",
  "message": "Testing idempotency feature - duplicate request prevention",
  "source": "run-sh-test",
  "environment": "test"
}'

    echo "Testing: Idempotency with duplicate requests"
    echo "Idempotency-Key: ${key}"
    echo ""
    
    # First request - should be processed
    echo -e "${YELLOW}First request (should be processed):${NC}"
    curl -s -X POST "${BASE_URL}/api/logs" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: ${key}" \
        -d "$payload" | jq . 2>/dev/null || cat
    echo ""
    
    # Second request with same key - should return cached response
    echo -e "${YELLOW}Second request (should return cached):${NC}"
    curl -s -X POST "${BASE_URL}/api/logs" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: ${key}" \
        -d '{"app_id":"different","message":"Different payload - should be ignored","source":"test","level":"ERROR"}' | jq . 2>/dev/null || cat
    echo ""
    
    # Verify Redis cache
    echo -e "${YELLOW}Verifying Redis cache:${NC}"
    redis-cli get "idempotency:${key}" 2>/dev/null | jq . 2>/dev/null || echo "Redis not available or key not found"
    echo ""
    
    # Performance test with idempotency header
    echo -e "${YELLOW}Load test with Idempotency-Key headers (unique keys):${NC}"
    echo ""
    
    oha -n 1000 \
        -c 50 \
        -m POST \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: perf-test-{n}" \
        -d "$payload" \
        --latency-correction \
        "${BASE_URL}/api/logs" | tee -a "${RESULTS_FILE}"
}

###############################################################################
# Test Suites
###############################################################################

run_all_tests() {
    print_header "Running ALL Performance Tests"
    
    test_health_check
    sleep 2
    
    test_single_log_light
    sleep 2
    
    test_single_log_medium
    sleep 2
    
    test_query_performance
    sleep 2
    
    test_duration_based
    sleep 2
    
    test_burst_load
    sleep 2
    
    test_large_payload
    sleep 2
    
    # Heavy load last (optional)
    read -p "Run heavy load test (100k requests)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_single_log_heavy
    fi
}

run_quick_tests() {
    print_header "Running Quick Performance Tests"
    
    test_health_check
    sleep 2
    
    test_single_log_light
    sleep 2
    
    test_query_performance
}

run_stress_tests() {
    print_header "Running STRESS Tests (High Load)"
    
    echo -e "${YELLOW}WARNING: This will generate heavy load!${NC}"
    read -p "Continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
    
    test_burst_load
    sleep 5
    
    test_duration_based
    sleep 5
    
    test_single_log_heavy
}

###############################################################################
# Main Menu
###############################################################################


show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Log Ingestion Platform - Performance Testing        ║${NC}"
    echo -e "${CYAN}║                  Using oha Load Tester                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Target Host: ${YELLOW}${BASE_URL}${NC}"
    echo ""
    echo "Select a test suite:"
    echo ""
    echo "  1) Health Check Only"
    echo "  2) Single Log - Light Load (1k requests)"
    echo "  3) Single Log - Medium Load (10k requests)"
    echo "  4) Single Log - Heavy Load (100k requests)"
    echo "  5) Duration-Based Test (30s sustained)"
    echo "  6) Burst Load Test (spike simulation)"
    echo "  7) Query/Retrieval Performance"
    echo "  8) Large Payload Test"
    echo "  9) Idempotency Test (duplicate request prevention)"
    echo ""
    echo " 10) Quick Test Suite (health + light + query)"
    echo " 11) All Tests (comprehensive)"
    echo " 12) Stress Tests (heavy load)"
    echo ""
    echo "  c) Configure Target Host (Currently: ${BASE_URL})"
    echo "  0) Exit"
    echo ""
}

# ... (omitted sections)

main() {
    # Pre-flight checks
    check_oha
    create_results_dir
    
    # Show menu if no arguments
    if [ $# -eq 0 ]; then
        while true; do
            show_menu
            read -p "Enter choice [0-12, c]: " choice
            
            case $choice in
                c|C)
                    read -p "Enter target URL (e.g. http://192.168.1.5:3000): " new_url
                    if [[ -n "$new_url" ]]; then
                        BASE_URL="$new_url"
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
    
    # Check server before running tests (unless we just configured it)
    check_server
    
    case $choice in
        1) test_health_check ;;
        2) test_single_log_light ;;
        3) test_single_log_medium ;;
        4) test_single_log_heavy ;;
        5) test_duration_based ;;
        6) test_burst_load ;;
        7) test_query_performance ;;
        8) test_large_payload ;;
        9) test_idempotency ;;
        10) run_quick_tests ;;
        11) run_all_tests ;;
        12) run_stress_tests ;;
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

