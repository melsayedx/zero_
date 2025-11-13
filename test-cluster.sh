#!/bin/bash

# Cluster Mode Test Script
# Tests the cluster functionality

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          Node.js Cluster Mode - Quick Test               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if cluster.js exists
if [ ! -f "cluster.js" ]; then
    echo "❌ cluster.js not found!"
    exit 1
fi

echo "✓ cluster.js found"
echo ""

# Start cluster in background with 4 workers
echo "Starting cluster with 4 workers..."
echo "(This will run for 30 seconds, then we'll test it)"
echo ""

# Set environment variables
export CLUSTER_WORKERS=4
export CLUSTER_API_PORT=9000
export HTTP_PORT=3000
export GRPC_PORT=50051

# Start cluster in background
node cluster.js &
CLUSTER_PID=$!

echo "Cluster started with PID: $CLUSTER_PID"
echo "Waiting 10 seconds for workers to initialize..."
sleep 10

# Test if cluster is running
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Cluster API (port 9000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test health endpoint
echo "1. Health Check:"
curl -s http://localhost:9000/health | jq '.' || echo "   (jq not installed, raw output above)"
echo ""

# Test stats endpoint
echo "2. Cluster Statistics:"
curl -s http://localhost:9000/stats | jq '.cluster, .workers[] | {id, pid, healthy, requestsHandled, memoryMB}' || echo "   (jq not installed, raw output above)"
echo ""

# Test HTTP endpoint
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Application Endpoints (port 3000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "3. Application Health Check:"
curl -s http://localhost:3000/health | jq '.' || echo "   (jq not installed, raw output above)"
echo ""

# Send some test requests to distribute load
echo "4. Sending 20 test requests across workers..."
for i in {1..20}; do
    curl -s -X POST http://localhost:3000/api/logs \
        -H "Content-Type: application/json" \
        -d '{
            "app_id": "test-cluster",
            "level": "INFO",
            "message": "Test log from cluster test script #'$i'",
            "source": "test-script",
            "environment": "test"
        }' > /dev/null &
done

# Wait for requests to complete
sleep 2
echo "   Done!"
echo ""

# Check stats again to see request distribution
echo "5. Request Distribution Across Workers:"
curl -s http://localhost:9000/stats | jq '.workers[] | {id, pid, requests: .requestsHandled}' || echo "   (jq not installed, raw output above)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Cluster Test Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Shutting down cluster..."

# Graceful shutdown
kill -TERM $CLUSTER_PID
wait $CLUSTER_PID 2>/dev/null

echo "✓ Cluster shut down successfully"
echo ""
echo "Next steps:"
echo "  • Start cluster: npm run start:cluster"
echo "  • View stats: curl http://localhost:9000/stats"
echo "  • Rolling restart: kill -USR2 <master-pid>"
echo "  • Read guide: cat CLUSTER_GUIDE.md"
echo ""

