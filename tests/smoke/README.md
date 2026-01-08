# Smoke Test Suite - Audio Pipeline Testing

## Overview

This directory contains automated smoke tests for the Jarvis v4 audio pipeline, covering Phases 1-3 of the [AUDIO_SMOKE_TEST.md](../../docs/AUDIO_SMOKE_TEST.md) plan.

## Test Suites

### Phase 1: Backend Verification (`phase1-backend.test.ts`)

Tests basic backend functionality:

- ✅ Health check endpoint validation
- ✅ AudioService initialization
- ✅ Deepgram API connectivity

### Phase 2: Socket.IO Audio Streaming (`phase2-socketio.test.ts`)

Tests real-time audio streaming:

- ✅ WebSocket connection establishment
- ✅ Audio chunk upload
- ✅ Speech-to-Text transcription end-to-end

### Phase 3: Error Handling (`phase3-errors.test.ts`)

Tests resilience and error handling:

- ✅ Invalid audio format handling
- ✅ API failure graceful degradation
- ✅ Network interruption recovery
- ✅ Multiple rapid connections
- ✅ Invalid state handling

### Sentry Validation (`phase-sentry-validation.test.ts`)

Tests error monitoring integration:

- ✅ Intentional error capture
- ✅ Server health after errors
- ✅ Configuration validation
- ✅ Multiple error handling

## Prerequisites

### 1. Environment Variables

Create a `.env` file with required API keys:

```bash
# Required for all tests
NODE_ENV=development
SENTRY_DSN=your_sentry_dsn_here

# Required for audio tests (Phase 1.3, Phase 2.3)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Required for full audio pipeline (not used in smoke tests)
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

⚠️ **Note**: Tests will skip certain validations if API keys are not configured, but will not fail.

### 2. Start the Development Server

Smoke tests require a running server on `http://localhost:3000`:

```bash
npm run dev
```

Wait for the server to start (you should see "🎉 Jarvis v4 server listening on port 3000").

### 3. Install Dependencies

If not already installed:

```bash
npm install
```

## Running Tests

### Run All Smoke Tests

```bash
npm run test:smoke
```

### Run Individual Phase Tests

```bash
# Phase 1 - Backend verification
npm run test:phase1

# Phase 2 - Socket.IO audio streaming
npm run test:phase2

# Phase 3 - Error handling
npm run test:phase3
```

### Watch Mode

Auto-rerun tests on file changes:

```bash
npm run test:smoke:watch
```

### Run Without Server (Will Fail)

To verify error handling when server is not running:

```bash
# Stop the server first
npm run test:smoke
# Should fail with "Server not ready" error
```

## Test Fixtures

### Audio Files

- **`test-audio.wav`** - 0.5 second silence WAV file (44KB, 44.1kHz, 16-bit PCM)
  - Used for Deepgram API connectivity tests
  - Used for Socket.IO audio streaming tests

- **`invalid-audio.bin`** - Random binary data (1KB)
  - Used for error handling tests
  - Tests graceful handling of invalid formats

## Expected Output

### Successful Run

```
PASS tests/smoke/phase1-backend.test.ts
✅ Server is ready for Phase 1 tests
✅ Deepgram API connection successful
  Phase 1: Backend Verification
    ✓ 1.1 - Health Check Validation (150 ms)
    ✓ 1.2 - AudioService Initialization (45 ms)
    ✓ 1.3 - Deepgram API Connection (2341 ms)

PASS tests/smoke/phase2-socketio.test.ts
✅ Server is ready for Phase 2 tests
✅ Socket.IO connected: abc123
  Phase 2: Socket.IO Audio Streaming
    ✓ 2.1 - Socket Connection (50 ms)
    ✓ 2.2 - Audio Stream Upload (1205 ms)
    ✓ 2.3 - Speech-to-Text Processing (3450 ms)

PASS tests/smoke/phase3-errors.test.ts
✅ Server is ready for Phase 3 tests
  Phase 3: Error Handling
    ✓ 3.1 - Invalid Audio Format (1102 ms)
    ✓ 3.2 - Deepgram API Failure Handling (56 ms)
    ✓ 3.3 - Network Interruption Recovery (2518 ms)
    ✓ 3.4 - Multiple Rapid Connections (845 ms)
    ✓ 3.5 - Stream Without Starting (1023 ms)

PASS tests/smoke/phase-sentry-validation.test.ts
✅ Server is ready for Sentry validation tests
  Sentry Integration
    ✓ Captures intentional errors via debug endpoint (89 ms)
    ✓ Server remains healthy after Sentry error (123 ms)
    ✓ Health check does not trigger Sentry errors (67 ms)
    ✓ Sentry configuration is present (12 ms)
    ✓ Multiple errors are handled independently (234 ms)

Test Suites: 4 passed, 4 total
Tests:       17 passed, 17 total
```

## Troubleshooting

### "Server not ready for testing"

**Problem**: Tests fail with "Server not ready" error

**Solution**:

1. Ensure the server is running: `npm run dev`
2. Check that port 3000 is not blocked
3. Verify server health: `curl http://localhost:3000/health`

### "DEEPGRAM_API_KEY not set"

**Problem**: Phase 1.3 and Phase 2.3 tests are skipped

**Solution**:

1. Add `DEEPGRAM_API_KEY` to your `.env` file
2. Restart the server
3. Re-run tests

⚠️ These tests are skipped gracefully and don't cause failures.

### Socket Connection Timeouts

**Problem**: Phase 2 tests timeout on Socket.IO connection

**Solution**:

1. Check server logs for errors
2. Verify Socket.IO is initialized (check server startup logs)
3. Ensure no firewall blocking WebSocket connections
4. Try restarting the server

### Deepgram API Errors

**Problem**: "Deepgram API connection failed"

**Solution**:

1. Verify API key is valid
2. Check Deepgram dashboard for quota/limits
3. Test API key independently:
   ```bash
   curl -H "Authorization: Token YOUR_KEY" \
        https://api.deepgram.com/v1/projects
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Smoke Tests

on: [push, pull_request]

jobs:
  smoke-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Start server
        run: npm run dev &
        env:
          DEEPGRAM_API_KEY: ${{ secrets.DEEPGRAM_API_KEY }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}

      - name: Wait for server
        run: |
          for i in {1..30}; do
            if curl -f http://localhost:3000/health; then
              echo "Server is ready"
              break
            fi
            echo "Waiting for server..."
            sleep 2
          done

      - name: Run smoke tests
        run: npm run test:smoke
        env:
          DEEPGRAM_API_KEY: ${{ secrets.DEEPGRAM_API_KEY }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
```

## Test Coverage

These smoke tests validate:

✅ **Backend Health**: Server startup, health endpoints, system metrics  
✅ **Service Initialization**: AudioService loads without errors  
✅ **External APIs**: Deepgram connectivity and authentication  
✅ **Real-time Communication**: Socket.IO WebSocket connections  
✅ **Audio Processing**: STT transcription pipeline  
✅ **Error Resilience**: Invalid input handling, API failures, network issues  
✅ **Monitoring**: Sentry error tracking and reporting

## Next Steps

After smoke tests pass, consider:

1. **Manual Testing**: Follow [AUDIO_SMOKE_TEST.md](../../docs/AUDIO_SMOKE_TEST.md) for Phase 4-5
2. **Performance Testing**: Measure latency and throughput
3. **Load Testing**: Test with multiple concurrent users
4. **Integration Testing**: Full end-to-end conversation flows

## Contributing

When adding new smoke tests:

1. Follow the existing naming pattern: `phaseN-description.test.ts`
2. Include server readiness check in `beforeAll`
3. Add appropriate timeouts for network operations
4. Log meaningful success/failure messages
5. Update this README with new test descriptions

## Support

For issues or questions:

- Check server logs: `npm run dev`
- Review test output for detailed error messages
- Verify environment configuration in `.env`
- Consult [AUDIO_SMOKE_TEST.md](../../docs/AUDIO_SMOKE_TEST.md) for context
