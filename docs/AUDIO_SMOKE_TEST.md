# Audio Pipeline Manual Smoke Test Plan

## Overview

This document outlines the manual smoke testing procedures for Jarvis-v4 audio functionality following the 8-week stabilization plan.

## Prerequisites

- Server deployed and running on DigitalOcean
- All PM2 processes online (verify with `pm2 status`)
- Health endpoint returning "healthy" status
- Sentry integration active and monitoring

## Test Environment

- **Server URL**: http://localhost:3000
- **Health Endpoint**: http://localhost:3000/health
- **Sentry Project**: yorkie-brown

---

## Phase 1: Backend Verification (Week 2)

### Test 1.1: Health Check Validation

**Objective**: Verify all services are operational

**Steps**:

1. Run: `curl http://localhost:3000/health`
2. Verify response contains:
   - `"status": "healthy"`
   - All required environment variables set
   - System information (platform, memory, uptime)

**Expected Result**: JSON response with status "healthy"
**Pass/Fail**: **\_\_**

### Test 1.2: Audio Service Initialization

**Objective**: Confirm AudioService is loaded and configured

**Steps**:

1. Check PM2 logs: `pm2 logs jarvis-server --lines 50 | grep -i audio`
2. Look for initialization messages
3. Verify no errors during AudioService instantiation

**Expected Result**: AudioService initialized without errors
**Pass/Fail**: **\_\_**

### Test 1.3: Deepgram API Connection

**Objective**: Verify STT backend connectivity

**Steps**:

1. Check environment variable: `echo $DEEPGRAM_API_KEY`
2. Verify key is loaded in health check response
3. Check for Deepgram connection errors in logs

**Expected Result**: API key configured, no connection errors
**Pass/Fail**: **\_\_**

---

## Phase 2: Socket.IO Audio Endpoints (Week 2-3)

### Test 2.1: Socket Connection

**Objective**: Establish WebSocket connection to audio endpoints

**Steps**:

1. Use Socket.IO client to connect to server
2. Monitor connection events
3. Verify successful handshake

**Expected Result**: Socket connection established
**Pass/Fail**: **\_\_**

### Test 2.2: Audio Stream Upload

**Objective**: Test audio data transmission

**Steps**:

1. Emit 'audio:stream' event with sample audio buffer
2. Monitor server logs for reception
3. Check for processing acknowledgment

**Expected Result**: Server receives and acknowledges audio stream
**Pass/Fail**: **\_\_**

### Test 2.3: Speech-to-Text Processing

**Objective**: Verify STT transcription

**Steps**:

1. Send audio sample containing speech
2. Wait for transcription response
3. Verify transcript accuracy
4. Check Sentry for any processing errors

**Expected Result**: Accurate text transcription returned
**Pass/Fail**: **\_\_**

---

## Phase 3: Error Handling (Week 3)

### Test 3.1: Invalid Audio Format

**Objective**: Test error handling for bad input

**Steps**:

1. Send invalid audio data format
2. Verify error response received
3. Check Sentry for logged error

**Expected Result**: Graceful error, logged to Sentry
**Pass/Fail**: **\_\_**

### Test 3.2: API Quota/Rate Limiting

**Objective**: Handle Deepgram API limits

**Steps**:

1. Monitor API usage in Deepgram dashboard
2. Verify rate limit handling if exceeded
3. Check error messages

**Expected Result**: Clear error messages, no crashes
**Pass/Fail**: **\_\_**

### Test 3.3: Network Interruption

**Objective**: Test resilience to connection drops

**Steps**:

1. Start audio stream
2. Simulate network interruption
3. Verify reconnection handling

**Expected Result**: Graceful reconnection or timeout
**Pass/Fail**: **\_\_**

---

## Phase 4: Integration Testing (Week 4)

### Test 4.1: End-to-End Audio Flow

**Objective**: Complete audio conversation cycle

**Steps**:

1. Connect client to server
2. Send voice query: "What is the weather today?"
3. Verify STT transcription
4. Verify agent processing
5. Check response generation

**Expected Result**: Complete conversation cycle
**Pass/Fail**: **\_\_**

### Test 4.2: Multi-User Concurrent Streams

**Objective**: Test multiple simultaneous audio sessions

**Steps**:

1. Open 3+ concurrent Socket connections
2. Stream audio from each simultaneously
3. Verify all transcriptions complete
4. Check for resource contention

**Expected Result**: All streams processed correctly
**Pass/Fail**: **\_\_**

### Test 4.3: Sentry Error Tracking

**Objective**: Verify production error monitoring

**Steps**:

1. Trigger intentional error in audio pipeline
2. Check Sentry dashboard for captured error
3. Verify error details (stack trace, context)

**Expected Result**: Error captured in Sentry with full context
**Pass/Fail**: **\_\_**

---

## Phase 5: Performance Validation (Week 4-5)

### Test 5.1: Latency Measurement

**Objective**: Measure audio processing speed

**Steps**:

1. Send 10-second audio sample
2. Measure time from upload to transcription
3. Calculate average latency over 5 samples

**Expected Result**: <3 seconds average latency
**Pass/Fail**: **\_\_**

### Test 5.2: Memory Usage

**Objective**: Monitor server resource consumption

**Steps**:

1. Check baseline memory: `pm2 status`
2. Process 10 audio streams
3. Check memory after processing
4. Verify no memory leaks

**Expected Result**: Memory returns to baseline, no leaks
**Pass/Fail**: **\_\_**

---

## Smoke Test Summary

**Test Date**: **\*\***\_\_\_**\*\***
**Tester**: **\*\***\_\_\_**\*\***
**Environment**: Production / Staging

**Overall Results**:

- Total Tests: 14
- Passed: **\_\_**
- Failed: **\_\_**
- Blocked: **\_\_**

**Critical Issues Found**:

1. ***
2. ***
3. ***

**Notes**:

---

---

**Sign-off**: **\*\***\_\_\_**\*\***
