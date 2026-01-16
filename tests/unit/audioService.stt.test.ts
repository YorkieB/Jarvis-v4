import http from 'http';
import AudioStreamingService from '../../src/services/audioService';

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

describe('AudioStreamingService - barge-in and failover', () => {
  const prismaMock: any = {};
  let service: AudioStreamingService;
  let socket: any;

  beforeEach(() => {
    const server = http.createServer();
    service = new AudioStreamingService(server as any, prismaMock) as any;
    socket = { id: 'socket-1', emit: jest.fn() };
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

    (service as any).handleSttFailure(session, 'deepgram', socket, 'test-error');

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
});
