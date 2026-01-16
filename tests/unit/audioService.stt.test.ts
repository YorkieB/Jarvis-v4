import http from 'http';
import AudioStreamingService from '../../src/services/audioService';

// snyk code ignore: javascript/NoHardcodedCredentials/test
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

// NOTE: Test-only environment values below are intentional fixtures to avoid real API calls.
// They are not used in production; Snyk false-positives can be ignored for these tests.
describe('AudioStreamingService - barge-in and failover', () => {
  const prismaMock: any = {};
  let service: AudioStreamingService;
  let socket: any;

  beforeEach(() => {
    const server = http.createServer();
    service = new AudioStreamingService(server as any, prismaMock) as any;
    socket = { id: 'socket-1', emit: jest.fn() };
    process.env.TENANT_TOKEN = 'test-token';
  });

  it('cancels TTS on barge-in (audio chunk with RMS)', () => {
    const abortController = new AbortController();
    const session: any = {
      sessionId: 'sess-1',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now(),
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
      ttsAbort: abortController,
      ttsInProgress: true,
      sttProvider: 'deepgram',
      consecutiveSttFailures: 0,
    };
    (service as any).activeSessions.set(socket.id, session);

    // High-energy buffer to trigger RMS-based barge-in
    const buffer = Buffer.alloc(4000, 0xff);
    (service as any).handleAudioChunk(socket, buffer);

    expect(abortController.signal.aborted).toBe(true);
    expect(session.ttsInProgress).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('tts-cancel');
  });

  it('fails over to Google STT after repeated failures', () => {
    const session: any = {
      sessionId: 'sess-2',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now(),
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
      sttProvider: 'deepgram',
      consecutiveSttFailures: 1,
    };
    (service as any).activeSessions.set(socket.id, session);
    jest.spyOn(service as any, 'startGoogleStream').mockImplementation(() => {
      session.googleActive = true;
    });

    (service as any).handleSttFailure(
      session,
      'deepgram',
      socket,
      'test-error',
    );

    expect(session.sttProvider).toBe('google');
    expect(socket.emit).toHaveBeenCalledWith(
      'stt-provider-changed',
      expect.objectContaining({ provider: 'google' }),
    );
  });

  it('emits audio-complete when TTS finishes (supports continuous restart client-side)', async () => {
    const session: any = {
      sessionId: 'sess-3',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now(),
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
    };
    (service as any).activeSessions.set(socket.id, session);
    (service as any).elevenlabs = {
      textToSpeech: {
        convert: jest.fn(async function* () {
          yield Buffer.from('audio');
        }),
      },
    };

    await (service as any).synthesizeSpeech(socket, session, 'hello', 0);

    expect(socket.emit).toHaveBeenCalledWith('audio-chunk', expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith('audio-complete');
  });

  it('emits voice-error and audio-complete when TTS unavailable', async () => {
    const session: any = {
      sessionId: 'sess-4',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now(),
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
    };
    (service as any).activeSessions.set(socket.id, session);
    (service as any).elevenlabs = null;

    await (service as any).synthesizeSpeech(socket, session, 'hello', 0);

    expect(socket.emit).toHaveBeenCalledWith('voice-error', expect.any(Object));
    expect(socket.emit).toHaveBeenCalledWith('audio-complete');
  });

  it('switches back to Deepgram from Google and ends Google stream', () => {
    const session: any = {
      sessionId: 'sess-5',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now(),
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
      sttProvider: 'google',
      consecutiveSttFailures: 0,
      googleActive: true,
      googleStream: { end: jest.fn(), writable: true },
    };
    (service as any).activeSessions.set(socket.id, session);

    (service as any).switchSttProvider(session, socket, 'deepgram', 'manual');

    expect(session.sttProvider).toBe('deepgram');
    expect(socket.emit).toHaveBeenCalledWith(
      'stt-provider-changed',
      expect.objectContaining({ provider: 'deepgram' }),
    );
  });

  it('handleEndStream cleans up session and emits stream-ended', async () => {
    const session: any = {
      sessionId: 'sess-6',
      deepgramConnection: { send: jest.fn(), on: jest.fn(), finish: jest.fn() },
      transcriptBuffer: '',
      startTime: Date.now() - 1000,
      userId: 'user-1',
      audioBuffer: [],
      latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      turnGuard: 0,
      sttProvider: 'deepgram',
      consecutiveSttFailures: 0,
    };
    (service as any).activeSessions.set(socket.id, session);

    await (service as any).handleEndStream(socket);

    expect((service as any).activeSessions.has(socket.id)).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('stream-ended');
  });
});
