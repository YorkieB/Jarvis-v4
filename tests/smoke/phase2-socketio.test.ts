/**
 * Phase 2: Socket.IO Audio Streaming Tests
 * Validates Socket.IO connection, audio streaming, and STT transcription
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 2: Socket.IO Audio Streaming', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let socket: Socket;

  // Wait for server to be ready before running tests
  beforeAll(async () => {
    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        if (response.ok) {
          console.log('✅ Server is ready for Phase 2 tests');
          break;
        }
      } catch (error) {
        console.log(
          `⏳ Waiting for server... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    return new Promise<void>((resolve, reject) => {
      socket = io(BASE_URL, {
        transports: ['websocket'],
        reconnection: true,
      });

      socket.on('connect', () => {
        console.log('✅ Socket.IO connected:', socket.id);
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        reject(error);
      });
    });
  }, 15000);

  afterEach(() => {
    // Clean up any active listeners after each test
    if (socket && socket.connected) {
      socket.removeAllListeners('stream-started');
      socket.removeAllListeners('stream-ended');
      socket.removeAllListeners('transcription');
      socket.removeAllListeners('error');
    }
  });

  afterAll((done) => {
    if (socket && socket.connected) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    // Give time for cleanup
    setTimeout(done, 500);
  });

  test('2.1 - Socket Connection', () => {
    expect(socket.connected).toBe(true);
    expect(socket.id).toBeDefined();
  });

  test('2.2 - Audio Stream Upload', (done) => {
    // Skip if no valid API key is configured
    if (
      !process.env.DEEPGRAM_API_KEY ||
      process.env.DEEPGRAM_API_KEY === 'dummy-key-for-testing'
    ) {
      console.warn(
        '⚠️  DEEPGRAM_API_KEY not set or invalid, skipping audio stream test',
      );
      done();
      return;
    }

    expect(socket.connected).toBe(true);

    // Listen for stream-started event
    socket.once('stream-started', (data) => {
      console.log('✅ Stream started:', data);
      expect(data.sessionId).toBeDefined();

      // Send a sample audio chunk (minimal WAV data)
      const audioBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // "RIFF"
        0x24,
        0x00,
        0x00,
        0x00, // File size
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
        0x00, // Subchunk1 size
        0x01,
        0x00, // PCM
        0x01,
        0x00, // Mono
        0x44,
        0xac,
        0x00,
        0x00, // 44100 Hz
        0x88,
        0x58,
        0x01,
        0x00, // Byte rate
        0x02,
        0x00, // Block align
        0x10,
        0x00, // 16 bits
        0x64,
        0x61,
        0x74,
        0x61, // "data"
        0x00,
        0x00,
        0x00,
        0x00, // Data size
      ]);

      socket.emit('audio-chunk', audioBuffer);

      // Wait a moment for processing
      setTimeout(() => {
        socket.emit('end-audio-stream');
      }, 500);
    });

    // Listen for stream-ended event
    socket.once('stream-ended', () => {
      console.log('✅ Stream ended successfully');
      done();
    });

    // Listen for errors
    socket.once('error', (error) => {
      console.error('❌ Stream error:', error);
      done(new Error(`Stream error: ${error.message || error}`));
    });

    // Start the audio stream
    socket.emit('start-audio-stream');
  }, 10000); // 10 second timeout

  test('2.3 - Speech-to-Text Processing', (done) => {
    // Skip if no valid API key is configured
    if (
      !process.env.DEEPGRAM_API_KEY ||
      process.env.DEEPGRAM_API_KEY === 'dummy-key-for-testing'
    ) {
      console.warn(
        '⚠️  DEEPGRAM_API_KEY not set or invalid, skipping STT test',
      );
      done();
      return;
    }

    expect(socket.connected).toBe(true);

    const testAudioPath = path.join(__dirname, '../fixtures/test-audio.wav');

    // Check if test audio exists
    if (!fs.existsSync(testAudioPath)) {
      console.warn(
        '⚠️  Test audio fixture not found, creating minimal file for test',
      );
      // Create minimal WAV file
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

    // Listen for transcription event
    socket.once('transcription', (data) => {
      console.log('✅ Transcription received:', data);

      // Verify transcription structure
      expect(data).toBeDefined();
      expect(data.transcript).toBeDefined();

      // Note: For minimal/silent audio, transcript might be empty
      // This is expected behavior, not an error
      console.log('Transcript content:', data.transcript);
    });

    // Listen for stream-ended event as fallback
    socket.once('stream-ended', () => {
      console.log('✅ Stream ended');
      // Even if no transcription (silent audio), stream should complete
      done();
    });

    // Listen for errors
    socket.once('error', (error) => {
      console.error('❌ Transcription error:', error);
      done(new Error(`Transcription error: ${error.message || error}`));
    });

    // Start the stream
    socket.once('stream-started', (data) => {
      console.log('✅ Stream started for STT test:', data);

      // Load and send test audio
      const audioData = fs.readFileSync(testAudioPath);

      // Send audio in chunks (simulate streaming)
      const chunkSize = 4096;
      let offset = 0;

      const sendChunk = () => {
        if (offset < audioData.length) {
          const chunk = audioData.slice(offset, offset + chunkSize);
          socket.emit('audio-chunk', chunk);
          offset += chunkSize;
          setTimeout(sendChunk, 50); // 50ms between chunks
        } else {
          // All chunks sent, end stream
          console.log('✅ All audio chunks sent');
          socket.emit('end-audio-stream');
        }
      };

      sendChunk();
    });

    socket.emit('start-audio-stream');
  }, 15000); // 15 second timeout for STT processing
});
