import http from 'http';
import { AddressInfo } from 'net';
import { io as Client } from 'socket.io-client';
import AudioStreamingService from '../../src/services/audioService';

// Mock external deps to avoid network calls
jest.mock('@deepgram/sdk', () => ({
  createClient: jest.fn(() => ({
    listen: {
      live: jest.fn(() => ({
        on: jest.fn(),
        send: jest.fn(),
        finish: jest.fn(),
      })),
    },
  })),
}));

jest.mock('@google-cloud/speech', () => ({
  SpeechClient: jest.fn(() => ({
    streamingRecognize: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      end: jest.fn(),
    })),
  })),
}));

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
);

jest.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: jest.fn(() => ({
    textToSpeech: { convert: jest.fn() },
  })),
}));

describe('AudioStreamingService Socket auth integration', () => {
  const prismaMock: any = {};
  let server: http.Server;
  let service: AudioStreamingService;
  let baseURL: string;
  let deepgramSendMock: jest.Mock;

  beforeAll((done) => {
    process.env.TENANT_TOKEN = 'test-tenant';
    // capture send mock to assert audio chunk forwarding
    deepgramSendMock = jest.fn();
    (require('@deepgram/sdk').createClient as jest.Mock).mockReturnValue({
      listen: {
        live: jest.fn(() => ({
          on: jest.fn(),
          send: deepgramSendMock,
          finish: jest.fn(),
        })),
      },
    });

    server = http.createServer();
    service = new AudioStreamingService(server as any, prismaMock) as any;
    server.listen(() => {
      const { port } = server.address() as AddressInfo;
      baseURL = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  it('rejects socket connection without tenant token', (done) => {
    const client = Client(baseURL, {
      transports: ['websocket'],
      auth: { userId: 'user-1' },
    });
    client.on('connect_error', (err: any) => {
      expect(err.message).toMatch(/invalid tenant token/i);
      client.close();
      done();
    });
  });

  it('accepts socket connection with tenant token and userId, and starts stream', (done) => {
    const client = Client(baseURL, {
      transports: ['websocket'],
      auth: { tenantToken: 'test-tenant', userId: 'user-1' },
      timeout: 2000,
    });

    client.on('connect', () => {
      client.emit('start-audio-stream');
    });

    client.on('stream-started', (data: any) => {
      expect(data).toHaveProperty('sessionId');
      client.close();
      done();
    });

    client.on('error', (err: any) => {
      // Fail fast if server emits error
      client.close();
      done(err);
    });

    client.on('connect_error', (err: any) => {
      client.close();
      done(err);
    });
  });

  it('forwards audio chunks to the STT provider after stream start', (done) => {
    deepgramSendMock.mockClear();
    const client = Client(baseURL, {
      transports: ['websocket'],
      auth: { tenantToken: 'test-tenant', userId: 'user-2' },
      timeout: 2000,
    });

    client.on('connect', () => {
      client.emit('start-audio-stream');
    });

    client.on('stream-started', () => {
      const buf = Buffer.alloc(320); // small chunk
      client.emit('audio-chunk', buf);
      setTimeout(() => {
        expect(deepgramSendMock).toHaveBeenCalled();
        client.close();
        done();
      }, 50);
    });

    client.on('connect_error', (err: any) => {
      client.close();
      done(err);
    });

    client.on('error', (err: any) => {
      client.close();
      done(err);
    });
  });
});
