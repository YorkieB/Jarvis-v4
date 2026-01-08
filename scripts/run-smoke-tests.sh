#!/bin/bash
# Smoke Test Runner Script
# This script starts the server, waits for it to be ready, runs smoke tests, and then stops the server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Use TMPDIR if available, fallback to /tmp
LOG_DIR="${TMPDIR:-/tmp}"
SERVER_LOG="$LOG_DIR/jarvis-smoke-server.log"

echo "🚀 Starting Jarvis v4 smoke test runner..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found"
    echo "   Some tests may be skipped without API keys"
    echo ""
fi

# Build the application first
echo "🏗️  Building application..."
if ! npm run build; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build completed successfully"
echo ""

# Start the server in background
echo "📡 Starting development server..."
npm run dev > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

echo "   Server PID: $SERVER_PID"
echo "   Server log: $SERVER_LOG"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ Cleanup complete"
}

# Register cleanup function
trap cleanup EXIT INT TERM

# Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Server is ready!"
        echo ""
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Server failed to start within timeout"
    echo ""
    echo "Server logs (last 20 lines):"
    tail -20 "$SERVER_LOG"
    exit 1
fi

# Run the smoke tests
echo "🧪 Running smoke tests..."
echo ""

if npm run test:smoke; then
    echo ""
    echo "✅ All smoke tests passed!"
    exit 0
else
    echo ""
    echo "❌ Some smoke tests failed"
    echo ""
    echo "Server logs (last 50 lines):"
    tail -50 "$SERVER_LOG"
    exit 1
fi
