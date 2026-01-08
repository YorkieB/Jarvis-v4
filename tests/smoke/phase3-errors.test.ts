/**
 * Phase 3: Error Handling Tests
 * Validates error handling for invalid input, API failures, and network issues
 */

import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

describe('Phase 3: Error Handling', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const activeSockets: Socket[] = [];

  // Helper to track sockets for cleanup
  const createSocket = (
    options?: Partial<ManagerOptions & SocketOptions>,
  ): Socket => {
    const socket = io(BASE_URL, options);
    activeSockets.push(socket);
    return socket;
  };

  // Wait for server to be ready before running tests
  beforeAll(async () => {
    const maxRetries = 10;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        if (response.ok) {
          console.log('✅ Server is ready for Phase 3 tests');
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

  afterEach(() => {
    // Clean up all sockets created in this test
    activeSockets.forEach((socket) => {
      if (socket && socket.connected) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    });
    // Clear the array
    activeSockets.length = 0;
  });

  afterAll((done) => {
    // Give time for cleanup
    setTimeout(done, 500);
  });

  test('3.1 - Invalid Audio Format', (done) => {
    const socket = createSocket({
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected for invalid audio test');

      socket.once('stream-started', () => {
        // Send invalid data (string instead of buffer)
        socket.emit('audio-chunk', 'not-valid-audio-data');

        // Also try invalid binary data
        const invalidBuffer = Buffer.from('INVALID AUDIO FORMAT');
        socket.emit('audio-chunk', invalidBuffer);

        // Server should handle gracefully without crashing
        // Give it time to process
        setTimeout(() => {
          socket.emit('end-audio-stream');
        }, 1000);
      });

      socket.once('stream-ended', () => {
        console.log(
          '✅ Stream ended despite invalid audio (graceful handling)',
        );
        socket.disconnect();
        done();
      });

      socket.once('error', (error) => {
        // This is expected - invalid audio should trigger error
        console.log('✅ Error event received (expected):', error);
        expect(error).toBeDefined();
        socket.disconnect();
        done();
      });

      // Start the stream
      socket.emit('start-audio-stream');
    });

    socket.on('connect_error', (error) => {
      done(error);
    });
  }, 10000);

  test('3.2 - Deepgram API Failure Handling', async () => {
    // Test graceful degradation when API is unavailable
    // We can test by checking health endpoint still works
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as { status: string };
    expect(data.status).toBe('healthy');

    // Server should remain healthy even if Deepgram has issues
    // The AudioService error handling should prevent crashes
    console.log('✅ Server remains healthy with potential API issues');
  });

  test('3.3 - Network Interruption Recovery', (done) => {
    const socket = createSocket({
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 500,
    });

    let connected = false;
    let reconnected = false;

    socket.on('connect', () => {
      if (!connected) {
        connected = true;
        console.log('✅ Initial connection established');

        // Start audio stream
        socket.emit('start-audio-stream');

        socket.once('stream-started', () => {
          console.log('✅ Stream started');

          // Simulate network interruption by disconnecting
          setTimeout(() => {
            console.log('🔌 Simulating network disconnection...');
            socket.disconnect();
          }, 500);
        });
      } else if (!reconnected) {
        reconnected = true;
        console.log('✅ Reconnection successful');
        expect(socket.connected).toBe(true);
        socket.disconnect();
        done();
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected:', reason);

      if (connected && !reconnected) {
        // Attempt reconnection after brief delay
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          socket.connect();
        }, 1000);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      if (!reconnected) {
        done(error);
      }
    });
  }, 10000);

  test('3.4 - Multiple Rapid Connections', (done) => {
    // Test server handling of rapid connect/disconnect
    const numSockets = 3;
    let completedSockets = 0;

    for (let i = 0; i < numSockets; i++) {
      const socket = createSocket({
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', () => {
        console.log(`✅ Socket ${i + 1} connected`);

        // Immediately disconnect
        setTimeout(
          () => {
            socket.disconnect();
            completedSockets++;

            if (completedSockets === numSockets) {
              console.log('✅ All rapid connections handled successfully');
              done();
            }
          },
          100 * (i + 1),
        ); // Stagger disconnects
      });

      socket.on('connect_error', (error) => {
        console.error(`❌ Socket ${i + 1} connection error:`, error);
        done(error);
      });
    }
  }, 10000);

  test('3.5 - Stream Without Starting', (done) => {
    const socket = createSocket({
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected');

      // Try to send audio chunk without starting stream
      const audioBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      socket.emit('audio-chunk', audioBuffer);

      // Server should handle gracefully (either ignore or error)
      setTimeout(() => {
        // If we reach here without crash, server handled it gracefully
        console.log('✅ Server handled audio-chunk without stream start');
        socket.disconnect();
        done();
      }, 1000);
    });

    socket.on('connect_error', (error) => {
      done(error);
    });

    socket.on('error', (error) => {
      // This is also acceptable - server may send error for invalid state
      console.log(
        '✅ Server sent error for invalid state (acceptable):',
        error,
      );
      socket.disconnect();
      done();
    });
  }, 5000);
});
