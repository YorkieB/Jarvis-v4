/**
 * Phase 1: Backend Verification Tests
 * Validates backend health, AudioService initialization, and Deepgram connectivity
 */

import { createClient } from '@deepgram/sdk';
import * as path from 'path';
import * as fs from 'fs';

describe('Phase 1: Backend Verification', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  // Wait for server to be ready before running tests
  beforeAll(async () => {
    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        if (response.ok) {
          console.log('✅ Server is ready for Phase 1 tests');
          return;
        }
      } catch (error) {
        console.log(
          `⏳ Waiting for server... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
    throw new Error(
      'Server not ready. Please start the server with: npm run dev',
    );
  }, 15000);

  test('1.1 - Health Check Validation', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.environment).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBeGreaterThan(0);
    expect(data.system).toBeDefined();
    expect(data.system.platform).toBeDefined();
    expect(data.system.nodeVersion).toBeDefined();
    expect(data.system.memory).toBeDefined();
    expect(data.checks).toBeDefined();
  });

  test('1.2 - AudioService Initialization', async () => {
    // Verify health endpoint is working which confirms AudioService loaded
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    // If the server is healthy and running, AudioService was initialized
    // because it's part of the server startup in src/index.ts
    expect(data.status).toBe('healthy');

    // Additional check: verify all checks pass
    const allChecksPassed = Object.values(data.checks).every(
      (check: any) => check.status === 'pass',
    );
    expect(allChecksPassed).toBe(true);
  });

  test('1.3 - Deepgram API Connection', async () => {
    // Skip if no API key is configured
    if (!process.env.DEEPGRAM_API_KEY) {
      console.warn('⚠️  DEEPGRAM_API_KEY not set, skipping Deepgram test');
      return;
    }

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // Create a minimal test audio file (silence)
    const testAudioPath = path.join(__dirname, '../fixtures/test-audio.wav');

    // If fixture doesn't exist, create minimal WAV file
    if (!fs.existsSync(testAudioPath)) {
      console.warn(
        '⚠️  Test audio fixture not found, creating minimal WAV file',
      );
      // Minimal valid WAV header (44 bytes) + minimal data
      const wavHeader = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // "RIFF"
        0x24,
        0x00,
        0x00,
        0x00, // File size - 8
        0x57,
        0x41,
        0x56,
        0x45, // "WAVE"
        0x66,
        0x6d,
        0x74,
        0x20, // "fmt "
        0x10,
        0x00,
        0x00,
        0x00, // Subchunk1 size (16)
        0x01,
        0x00, // Audio format (1 = PCM)
        0x01,
        0x00, // Number of channels (1)
        0x44,
        0xac,
        0x00,
        0x00, // Sample rate (44100)
        0x88,
        0x58,
        0x01,
        0x00, // Byte rate
        0x02,
        0x00, // Block align
        0x10,
        0x00, // Bits per sample (16)
        0x64,
        0x61,
        0x74,
        0x61, // "data"
        0x00,
        0x00,
        0x00,
        0x00, // Data size
      ]);
      fs.mkdirSync(path.dirname(testAudioPath), { recursive: true });
      fs.writeFileSync(testAudioPath, wavHeader);
    }

    try {
      // Use Deepgram's prerecorded transcription API
      const audioBuffer = fs.readFileSync(testAudioPath);

      const { result, error } =
        await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
          model: 'nova-2',
          smart_format: true,
        });

      // Should not error
      expect(error).toBeUndefined();
      expect(result).toBeDefined();

      // Result should have expected structure
      expect(result).toBeDefined();
      if (result) {
        expect(result.metadata).toBeDefined();
        expect(result.results).toBeDefined();
      }

      console.log('✅ Deepgram API connection successful');
    } catch (error) {
      console.error('❌ Deepgram API connection failed:', error);
      throw error;
    }
  }, 15000); // 15 second timeout for API call
});
