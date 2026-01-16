import https from 'node:https';
import { Server as HttpServer } from 'node:http';
import fs from 'node:fs';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { io as Client } from 'socket.io-client';
import AudioStreamingService from '../../src/services/audioService';
import { prisma as globalPrisma } from '../../src/utils/prisma';
import { createClient } from '@deepgram/sdk';

type PrismaClient = typeof globalPrisma;
type StreamStartedPayload = { sessionId: string };
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
  const prismaMock: Partial<PrismaClient> = {};
  let server: HttpServer;
  let service: AudioStreamingService;
  let baseURL: string;
  let deepgramSendMock: jest.Mock;
  let tlsOptions: { ca: Buffer };

  beforeAll((done) => {
    process.env.TENANT_TOKEN = 'test-tenant';
    // capture send mock to assert audio chunk forwarding
    deepgramSendMock = jest.fn();
    jest.mocked(createClient).mockReturnValue({
      listen: {
        live: jest.fn(() => ({
          on: jest.fn(),
          send: deepgramSendMock,
          finish: jest.fn(),
        })),
      },
    } as unknown as ReturnType<typeof createClient>);

    const key = fs.readFileSync(
      path.resolve(__dirname, '../../certs/server.key'),
    );
    const cert = fs.readFileSync(
      path.resolve(__dirname, '../../certs/server.crt'),
    );
    tlsOptions = { ca: cert };
    server = https.createServer({ key, cert });
    // Service instantiation sets up Socket.IO handlers on the server
    service = new AudioStreamingService(
      server as HttpServer,
      prismaMock as PrismaClient,
    );
    expect(service).toBeInstanceOf(AudioStreamingService);
    server.listen(() => {
      const { port } = server.address() as AddressInfo;
      baseURL = `https://localhost:${port}`;
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
      transportOptions: { websocket: tlsOptions },
    });
    client.on('connect_error', (err: Error) => {
      expect(err.message).toMatch(/invalid tenant token/i);
      client.close();
      done();
    });
  });

  it('accepts socket connection with tenant token and userId, and starts stream', (done) => {
    const client = Client(baseURL, {
      transports: ['websocket'],
      auth: { tenantToken: 'test-tenant', userId: 'user-1' },
      transportOptions: { websocket: tlsOptions },
      timeout: 2000,
    });

    client.on('connect', () => {
      client.emit('start-audio-stream');
    });

    client.on('stream-started', (data: StreamStartedPayload) => {
      expect(data).toHaveProperty('sessionId');
      client.close();
      done();
    });

    client.on('error', (err: Error) => {
      // Fail fast if server emits error
      client.close();
      done(err);
    });

    client.on('connect_error', (err: Error) => {
      client.close();
      done(err);
    });
  });

  it('forwards audio chunks to the STT provider after stream start', (done) => {
    deepgramSendMock.mockClear();
    const client = Client(baseURL, {
      transports: ['websocket'],
      auth: { tenantToken: 'test-tenant', userId: 'user-2' },
      transportOptions: { websocket: tlsOptions },
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

    client.on('connect_error', (err: Error) => {
      client.close();
      done(err);
    });

    client.on('error', (err: Error) => {
      client.close();
      done(err);
    });
  });
});
