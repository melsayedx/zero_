#!/bin/bash

###############################################################################
# gRPC Performance Testing Script using ghz
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
GRPC_HOST="${GRPC_HOST:-localhost:50051}"
PROTO_FILE="./proto/logs.proto"
RESULTS_DIR="./performance-results"

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
        echo -e "${RED}❌ ghz is not installed!${NC}"
        echo ""
        echo "Install ghz:"
        echo "  macOS:   brew install ghz"
        echo "  Go:      go install github.com/bojand/ghz/cmd/ghz@latest"
        echo "  Binary:  https://github.com/bojand/ghz/releases"
        echo ""
        echo "After installing with Go, make sure \$GOPATH/bin is in your PATH:"
        echo "  export PATH=\$PATH:\$(go env GOPATH)/bin"
        exit 1
    fi
    
    echo -e "${GREEN}✅ ghz is installed ($(ghz --version))${NC}"
}

check_proto_file() {
    if [ ! -f "$PROTO_FILE" ]; then
        echo -e "${RED}❌ Proto file not found: $PROTO_FILE${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Proto file found: $PROTO_FILE${NC}"
}

check_server() {
    print_section "Checking if gRPC server is running..."
    
    # Test with ghz health check
    if ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.HealthCheck \
        -n 1 \
        -c 1 \
        "$GRPC_HOST" &> /dev/null; then
        echo -e "${GREEN}✅ gRPC server is running at ${GRPC_HOST}${NC}"
        return 0
    else
        echo -e "${RED}❌ gRPC server is not running at ${GRPC_HOST}${NC}"
        echo ""
        echo "Start the server with: npm start"
        echo "Or in cluster mode: npm run start:cluster"
        exit 1
    fi
}

create_results_dir() {
    mkdir -p "${RESULTS_DIR}"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    RESULTS_FILE="${RESULTS_DIR}/grpc_test_${TIMESTAMP}.txt"
    echo -e "${CYAN}📊 Results will be saved to: ${RESULTS_FILE}${NC}"
    echo ""
}

###############################################################################
# Test Scenarios
###############################################################################

test_health_check() {
    print_header "Test 1: gRPC Health Check"
    
    echo "Testing health check with high concurrency..."
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.HealthCheck \
        -d '{}' \
        -n 10000 \
        -c 100 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_single_light() {
    print_header "Test 2: Single Log Ingestion - Light Load (gRPC)"
    
    local data='{
  "logs": [
    {
      "app_id": "test-app",
      "level": "INFO",
      "message": "gRPC performance test - single log ingestion",
      "source": "ghz-test",
      "environment": "test",
      "metadata": {
        "test_type": "single_log",
        "load": "light",
        "protocol": "grpc"
      }
    }
  ]
}'

    echo "Testing: ${LIGHT_LOAD} requests with 50 concurrent connections"
    echo "Method: IngestLogs (single entry per request)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n ${LIGHT_LOAD} \
        -c 50 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_single_medium() {
    print_header "Test 3: Single Log Ingestion - Medium Load (gRPC)"
    
    local data='{
  "logs": [
    {
      "app_id": "api-gateway",
      "level": "INFO",
      "message": "User authentication successful - session created",
      "source": "auth-service",
      "environment": "production",
      "trace_id": "trace-xyz-456",
      "user_id": "user-abc-789",
      "metadata": {
        "user_id": "usr_1234567890",
        "ip_address": "192.168.1.100",
        "session_id": "sess_abcdefghij",
        "duration_ms": "145"
      }
    }
  ]
}'

    echo "Testing: ${MEDIUM_LOAD} requests with 100 concurrent connections"
    echo "Method: IngestLogs (single entry per request)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n ${MEDIUM_LOAD} \
        -c 100 \
        --connections=20 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_single_heavy() {
    print_header "Test 4: Single Log Ingestion - Heavy Load (gRPC)"
    
    local data='{
  "logs": [
    {
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
        "processing_time_ms": "1250"
      }
    }
  ]
}'

    echo "Testing: ${HEAVY_LOAD} requests with 200 concurrent connections"
    echo "Method: IngestLogs (single entry per request)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n ${HEAVY_LOAD} \
        -c 200 \
        --connections=50 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_batch_small() {
    print_header "Test 5: Batch Log Ingestion - Small Batches (10 logs)"
    
    local data='{
  "logs": [
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 1",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 2",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "DEBUG",
      "message": "Batch log entry 3",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "WARN",
      "message": "Batch log entry 4",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 5",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "ERROR",
      "message": "Batch log entry 6",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 7",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 8",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "DEBUG",
      "message": "Batch log entry 9",
      "source": "ghz-batch-test",
      "environment": "test"
    },
    {
      "app_id": "batch-test",
      "level": "INFO",
      "message": "Batch log entry 10",
      "source": "ghz-batch-test",
      "environment": "test"
    }
  ]
}'

    echo "Testing: 5000 batch requests (10 logs per batch = 50k logs total)"
    echo "Concurrency: 50 connections"
    echo "Method: IngestLogs (batch)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 5000 \
        -c 50 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_batch_medium() {
    print_header "Test 6: Batch Log Ingestion - Medium Batches (50 logs)"
    
    # Generate 50 log entries dynamically
    local logs_json=""
    for i in {1..50}; do
        if [ $i -gt 1 ]; then
            logs_json+=","
        fi
        logs_json+="{
      \"app_id\": \"batch-test-medium\",
      \"level\": \"INFO\",
      \"message\": \"Batch log entry $i of 50\",
      \"source\": \"ghz-medium-batch\",
      \"environment\": \"test\",
      \"metadata\": {
        \"batch_size\": \"50\",
        \"entry_number\": \"$i\"
      }
    }"
    done
    
    local data="{\"logs\": [$logs_json]}"

    echo "Testing: 2000 batch requests (50 logs per batch = 100k logs total)"
    echo "Concurrency: 50 connections"
    echo "Method: IngestLogs (batch)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 2000 \
        -c 50 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_ingest_batch_large() {
    print_header "Test 7: Batch Log Ingestion - Large Batches (100 logs)"
    
    echo "Testing: 1000 batch requests (100 logs per batch = 100k logs total)"
    echo "Concurrency: 30 connections"
    echo "Method: IngestLogs (batch)"
    echo ""
    echo "Generating 100-log batch payload..."
    
    # Generate 100 log entries
    local logs_json=""
    for i in {1..100}; do
        if [ $i -gt 1 ]; then
            logs_json+=","
        fi
        logs_json+="{
      \"app_id\": \"batch-test-large\",
      \"level\": \"INFO\",
      \"message\": \"Large batch log entry $i\",
      \"source\": \"ghz-large-batch\",
      \"environment\": \"production\"
    }"
    done
    
    local data="{\"logs\": [$logs_json]}"
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 1000 \
        -c 30 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_duration_based() {
    print_header "Test 8: Duration-Based Test (30 seconds)"
    
    local data='{
  "logs": [
    {
      "app_id": "notification-service",
      "level": "INFO",
      "message": "Email notification sent successfully",
      "source": "email-worker",
      "environment": "production"
    }
  ]
}'

    echo "Testing: 30 seconds sustained load with 100 concurrent connections"
    echo "Target: Maximum throughput for 30 seconds"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -z 30s \
        -c 100 \
        --connections=20 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_burst_load() {
    print_header "Test 9: Burst Load Test (gRPC)"
    
    local data='{
  "logs": [
    {
      "app_id": "api-gateway",
      "level": "WARN",
      "message": "Rate limit warning - approaching threshold",
      "source": "rate-limiter",
      "environment": "production"
    }
  ]
}'

    echo "Testing: Short burst with 500 concurrent connections"
    echo "Simulating traffic spike scenario"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 10000 \
        -c 500 \
        --connections=50 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_query_performance() {
    print_header "Test 10: Log Query/Retrieval Performance (gRPC)"
    
    echo "Testing: Query logs by app_id"
    echo "Method: GetLogsByAppId"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.GetLogsByAppId \
        -d '{"app_id": "test-app", "limit": 100}' \
        -n 1000 \
        -c 50 \
        --connections=10 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_large_payload() {
    print_header "Test 11: Large Payload Test (gRPC)"
    
    local data='{
  "logs": [
    {
      "app_id": "analytics-service",
      "level": "INFO",
      "message": "Large analytics event processed with extensive metadata",
      "source": "analytics-pipeline",
      "environment": "production",
      "metadata": {
        "event_type": "page_view",
        "session_id": "sess_1234567890abcdefghijklmnopqrstuvwxyz",
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "referrer": "https://example.com/previous-page?query=test",
        "page_url": "https://example.com/current-page?id=123",
        "screen_resolution": "1920x1080",
        "viewport_size": "1440x900",
        "device_type": "desktop",
        "browser": "Chrome",
        "browser_version": "119.0.0.0",
        "os": "macOS",
        "os_version": "14.1",
        "country": "US",
        "region": "California",
        "city": "San Francisco"
      }
    }
  ]
}'

    echo "Testing: Large payload (~1.5KB per request)"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 5000 \
        -c 100 \
        --connections=20 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

test_mixed_workload() {
    print_header "Test 12: Mixed Workload (Ingestion + Queries)"
    
    echo "Testing: Mixed workload simulation"
    echo "80% writes (IngestLog) + 20% reads (GetLogsByAppId)"
    echo ""
    
    echo "Phase 1: Heavy ingestion..."
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d '{"logs":[{"app_id": "mixed-test", "level": "INFO", "message": "Mixed workload test", "source": "ghz-mixed", "environment": "test"}]}' \
        -n 8000 \
        -c 80 \
        --connections=20 \
        "$GRPC_HOST" > /dev/null 2>&1 &
    
    sleep 2
    
    echo "Phase 2: Concurrent queries..."
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.GetLogsByAppId \
        -d '{"app_id": "mixed-test", "limit": 50}' \
        -n 2000 \
        -c 20 \
        --connections=5 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
    
    wait
    echo "Mixed workload test complete!"
}

test_connection_reuse() {
    print_header "Test 13: Connection Reuse Performance"
    
    local data='{
  "logs": [
    {
      "app_id": "connection-test",
      "level": "INFO",
      "message": "Testing connection reuse performance",
      "source": "ghz-connection-test",
      "environment": "test"
    }
  ]
}'

    echo "Testing with connection reuse (HTTP/2 multiplexing)..."
    echo "Single connection handling multiple concurrent requests"
    echo ""
    
    ghz --insecure \
        --proto="$PROTO_FILE" \
        --call=logs.LogService.IngestLogs \
        -d "$data" \
        -n 10000 \
        -c 100 \
        --connections=1 \
        "$GRPC_HOST" | tee -a "${RESULTS_FILE}"
}

###############################################################################
# Test Suites
###############################################################################

run_all_tests() {
    print_header "Running ALL gRPC Performance Tests"
    
    test_health_check
    sleep 2
    
    test_ingest_single_light
    sleep 2
    
    test_ingest_single_medium
    sleep 2
    
    test_ingest_batch_small
    sleep 2
    
    test_query_performance
    sleep 2
    
    test_duration_based
    sleep 2
    
    test_burst_load
    sleep 2
    
    test_large_payload
    sleep 2
    
    test_connection_reuse
    sleep 2
    
    # Heavy tests (optional)
    read -p "Run heavy load tests (batches + heavy single)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_ingest_batch_medium
        sleep 2
        test_ingest_batch_large
        sleep 2
        test_ingest_single_heavy
    fi
}

run_quick_tests() {
    print_header "Running Quick gRPC Performance Tests"
    
    test_health_check
    sleep 2
    
    test_ingest_single_light
    sleep 2
    
    test_ingest_batch_small
    sleep 2
    
    test_query_performance
}

run_batch_tests() {
    print_header "Running Batch Ingestion Tests"
    
    test_ingest_batch_small
    sleep 2
    
    test_ingest_batch_medium
    sleep 2
    
    test_ingest_batch_large
}

run_stress_tests() {
    print_header "Running gRPC STRESS Tests (High Load)"
    
    echo -e "${YELLOW}⚠️  WARNING: This will generate heavy load!${NC}"
    read -p "Continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
    
    test_burst_load
    sleep 5
    
    test_duration_based
    sleep 5
    
    test_ingest_batch_large
    sleep 5
    
    test_ingest_single_heavy
}

run_comparison_tests() {
    print_header "Running Comparison Tests (Single vs Batch)"
    
    echo "Test 1: Single log ingestion baseline..."
    test_ingest_single_medium
    sleep 3
    
    echo ""
    echo "Test 2: Batch ingestion (10 logs per batch)..."
    test_ingest_batch_small
    sleep 3
    
    echo ""
    echo "Test 3: Batch ingestion (50 logs per batch)..."
    test_ingest_batch_medium
    
    echo ""
    echo -e "${GREEN}Comparison complete! Check results file for details.${NC}"
}

###############################################################################
# Main Menu
###############################################################################

show_menu() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║      Log Ingestion Platform - gRPC Performance Testing   ║${NC}"
    echo -e "${CYAN}║                  Using ghz Load Tester                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Select a test suite:"
    echo ""
    echo "  1) Health Check Only"
    echo "  2) Single Log - Light Load (1k requests)"
    echo "  3) Single Log - Medium Load (10k requests)"
    echo "  4) Single Log - Heavy Load (100k requests)"
    echo "  5) Batch Ingestion - Small (10 logs/batch)"
    echo "  6) Batch Ingestion - Medium (50 logs/batch)"
    echo "  7) Batch Ingestion - Large (100 logs/batch)"
    echo "  8) Duration-Based Test (30s sustained)"
    echo "  9) Burst Load Test (spike simulation)"
    echo " 10) Query/Retrieval Performance"
    echo " 11) Large Payload Test"
    echo " 12) Mixed Workload (writes + reads)"
    echo " 13) Connection Reuse Performance"
    echo ""
    echo " 14) Quick Test Suite (health + light + batch + query)"
    echo " 15) All Batch Tests"
    echo " 16) All Tests (comprehensive)"
    echo " 17) Stress Tests (heavy load)"
    echo " 18) Comparison Tests (single vs batch)"
    echo ""
    echo "  0) Exit"
    echo ""
}

###############################################################################
# Main Script
###############################################################################

main() {
    # Pre-flight checks
    check_ghz
    check_proto_file
    check_server
    create_results_dir
    
    # Show menu if no arguments
    if [ $# -eq 0 ]; then
        show_menu
        read -p "Enter choice [0-18]: " choice
    else
        choice=$1
    fi
    
    case $choice in
        1) test_health_check ;;
        2) test_ingest_single_light ;;
        3) test_ingest_single_medium ;;
        4) test_ingest_single_heavy ;;
        5) test_ingest_batch_small ;;
        6) test_ingest_batch_medium ;;
        7) test_ingest_batch_large ;;
        8) test_duration_based ;;
        9) test_burst_load ;;
        10) test_query_performance ;;
        11) test_large_payload ;;
        12) test_mixed_workload ;;
        13) test_connection_reuse ;;
        14) run_quick_tests ;;
        15) run_batch_tests ;;
        16) run_all_tests ;;
        17) run_stress_tests ;;
        18) run_comparison_tests ;;
        0) echo "Exiting..."; exit 0 ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              gRPC Performance Test Complete!             ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Results saved to: ${CYAN}${RESULTS_FILE}${NC}"
    echo ""
    echo "Summary of tests:"
    echo "  • gRPC Server: ${GRPC_HOST}"
    echo "  • Proto file: ${PROTO_FILE}"
    echo "  • Test time: $(date)"
    echo ""
}

# Run main function
main "$@"

