/**
 * Audio Streaming Service - Complete STT → LLM → TTS Pipeline
 *
 * Implements the full voice conversation pipeline according to the
 * 8-week stabilization plan:
 * - Socket.IO audio streaming from browser
 * - Deepgram live STT transcription
 * - OpenAI streaming LLM responses
 * - ElevenLabs streaming TTS synthesis
 * - Latency tracking with Winston logging
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  createClient,
  LiveTranscriptionEvents,
  ListenLiveClient,
} from '@deepgram/sdk';
import { SpeechClient } from '@google-cloud/speech';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import logger from '../utils/logger';
import VoiceAuthService from './voiceAuthService';
import { PrismaClient } from '@prisma/client';
import { getLLMConfig } from '../config/llmConfig';

interface DeepgramTranscriptData {
  channel: {
    alternatives: Array<{
      transcript: string;
    }>;
  };
  is_final: boolean;
}

interface AudioSession {
  sessionId: string;
  deepgramConnection: ListenLiveClient;
  transcriptBuffer: string;
  startTime: number;
  userId?: string; // User ID for voice authentication
  audioBuffer: Buffer[]; // Buffer for voice verification
  ttsAbort?: AbortController;
  ttsInProgress?: boolean;
  turnGuard: number;
  googleStream?: NodeJS.WritableStream;
  googleActive?: boolean;
  sttProvider: 'deepgram' | 'google';
  consecutiveSttFailures: number;
  latencyMetrics: {
    stt: number;
    llm: number;
    tts: number;
  };
}

class AudioStreamingService {
  private io: SocketIOServer;
  private deepgram: ReturnType<typeof createClient>;
  private openai: OpenAI;
  private elevenlabs: ElevenLabsClient | null;
  private googleSpeech: SpeechClient | null;
  private activeSessions: Map<string, AudioSession>;
  private voiceAuth: VoiceAuthService;
  private prisma: PrismaClient;
  private readonly VOICE_AUTH_ENABLED =
    process.env.VOICE_AUTH_ENABLED !== 'false'; // Default enabled
  private readonly sttPrimary: 'deepgram' | 'google';
  private readonly sttFailureThreshold: number;

  constructor(httpServer: HttpServer, prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.voiceAuth = new VoiceAuthService(this.prisma);
    // Initialize Socket.IO with CORS
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // Configure appropriately for production
        methods: ['GET', 'POST'],
      },
    });
    // Tenant token gate on socket connection
    this.io.use((socket, next) => {
      const tenantToken =
        (socket.handshake.auth?.tenantToken as string) ||
        (socket.handshake.query.tenantToken as string);
      if (!tenantToken || tenantToken !== process.env.TENANT_TOKEN) {
        return next(new Error('unauthorized: invalid tenant token'));
      }
      const userId =
        (socket.handshake.auth?.userId as string) ||
        (socket.handshake.query.userId as string);
      if (!userId) {
        return next(new Error('unauthorized: missing userId'));
      }
      // attach for later use
      socket.data.userId = userId;
      return next();
    });

    // Initialize API clients
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.googleSpeech = new SpeechClient();
    const primaryEnv = (process.env.STT_PRIMARY || 'deepgram').toLowerCase();
    const primary: 'deepgram' | 'google' =
      primaryEnv === 'google' && this.googleSpeech ? 'google' : 'deepgram';
    this.sttPrimary = primary;
    this.sttFailureThreshold = parseInt(process.env.STT_FAILOVER_THRESHOLD || '2', 10) || 2;

    // Non-blocking ElevenLabs initialization
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        logger.warn('⚠️  ELEVENLABS_API_KEY not set - TTS will be unavailable');
        this.elevenlabs = null;
      } else {
        this.elevenlabs = new ElevenLabsClient({
          apiKey: process.env.ELEVENLABS_API_KEY,
        });
        logger.info('✅ ElevenLabs client initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize ElevenLabs client', { error });
      logger.warn('⚠️  TTS functionality will be unavailable');
      this.elevenlabs = null;
    }

    this.activeSessions = new Map();

    this.setupSocketHandlers();
    logger.info('Audio Streaming Service initialized');
    if (this.VOICE_AUTH_ENABLED) {
      logger.info('Voice authentication: ENABLED');
    } else {
      logger.warn('Voice authentication: DISABLED');
    }
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on('start-audio-stream', () => this.handleStartStream(socket));
      socket.on('audio-chunk', (data) => this.handleAudioChunk(socket, data));
      socket.on('end-audio-stream', () => this.handleEndStream(socket));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  private async handleStartStream(socket: Socket): Promise<void> {
    const sessionId = socket.id;
    const startTime = Date.now();

    try {
      // Create Deepgram live transcription connection
      const deepgramConnection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        endpointing: 150, // tighter endpoint to cut latency
      });

      // Enforce userId from authenticated handshake only
      const userId = socket.data?.userId as string;

      if (!userId) {
        socket.emit('error', { message: 'Missing userId for voice session' });
        return;
      }

      // Initialize session
      const session: AudioSession = {
        sessionId,
        deepgramConnection,
        transcriptBuffer: '',
        startTime,
        userId,
        audioBuffer: [],
        latencyMetrics: { stt: 0, llm: 0, tts: 0 },
        turnGuard: 0,
        sttProvider: this.sttPrimary,
        consecutiveSttFailures: 0,
      };

      this.activeSessions.set(sessionId, session);

      // If Google is primary, start it immediately
      if (session.sttProvider === 'google' && this.googleSpeech) {
        this.startGoogleStream(sessionId, session, socket, 'primary');
      }

      // Inform client of current STT provider
      socket.emit('stt-provider-changed', {
        provider: session.sttProvider,
        reason: 'initial',
      });
      logger.info('Initialized voice session STT provider', {
        sessionId,
        provider: session.sttProvider,
      });

      // Handle Deepgram transcription events
      deepgramConnection.on(
        LiveTranscriptionEvents.Transcript,
        async (data: DeepgramTranscriptData) => {
          if (session.sttProvider !== 'deepgram') {
            return; // ignore if Deepgram not current provider
          }
          const transcript = data.channel.alternatives[0].transcript;

          const cleanedTranscript = transcript?.trim() || '';

          // If TTS is running and we detect new speech (interim or final), cancel TTS (barge-in)
          if (cleanedTranscript.length > 0) {
            const sessionState = this.activeSessions.get(sessionId);
            if (sessionState?.ttsInProgress && sessionState.ttsAbort && !sessionState.ttsAbort.signal.aborted) {
              sessionState.ttsAbort.abort();
              sessionState.ttsInProgress = false;
              sessionState.turnGuard += 1; // invalidate in-flight turn
              socket.emit('tts-cancel');
            }
          }

          // VAD / early cut: if we have confident interim text, process without waiting for is_final
          const shouldEarlyProcess =
            cleanedTranscript.length > 8 &&
            (cleanedTranscript.endsWith('.') ||
              cleanedTranscript.endsWith('?') ||
              cleanedTranscript.endsWith('!'));

          if (cleanedTranscript && (data.is_final || shouldEarlyProcess)) {
            const sttLatency = Date.now() - startTime;
            session.latencyMetrics.stt = sttLatency;
            session.consecutiveSttFailures = 0;

            logger.info('STT Complete', {
              sessionId,
              transcript: cleanedTranscript,
              latency: sttLatency,
            });

            // Voice verification (if enabled and user is not anonymous)
            if (
              this.VOICE_AUTH_ENABLED &&
              session.userId &&
              session.userId !== 'anonymous'
            ) {
              // Combine audio buffer for verification
              const combinedAudio = Buffer.concat(session.audioBuffer);

              if (combinedAudio.length > 0) {
                const verification = await this.voiceAuth.verifyVoice(
                  session.userId,
                  combinedAudio,
                );

                if (!verification.verified) {
                  logger.warn('Voice verification failed', {
                    sessionId,
                    userId: session.userId,
                    confidence: verification.confidence,
                  });

                  socket.emit('error', {
                    message:
                      verification.message ||
                      'Voice not recognized. Jarvis only responds to authorized users.',
                  });
                  socket.emit('voice-verification-failed', {
                    confidence: verification.confidence,
                    message: verification.message,
                  });

                  // Clear audio buffer
                  session.audioBuffer = [];
                  return; // Don't process conversation
                }

                logger.info('Voice verified', {
                  sessionId,
                  userId: session.userId,
                  confidence: verification.confidence,
                });
              }
            }

            // Emit transcript to client
            socket.emit('transcription', { transcript });

            // Process through LLM and TTS
            const turnId = session.turnGuard;
            await this.processConversationTurn(socket, session, cleanedTranscript, turnId);

            // Clear audio buffer after processing
            session.audioBuffer = [];
          }
        },
      );

      deepgramConnection.on(LiveTranscriptionEvents.Error, (error: Error) => {
        logger.error('Deepgram error', { sessionId, error });
        socket.emit('error', { message: 'Speech recognition error' });
        this.handleSttFailure(session, 'deepgram', socket, 'provider-error');
      });

      socket.emit('stream-started', { sessionId });
      logger.info('Audio stream started', { sessionId });
    } catch (error) {
      logger.error('Failed to start audio stream', { sessionId, error });
      socket.emit('error', { message: 'Failed to initialize audio stream' });
    }
  }

  private handleAudioChunk(
    socket: Socket,
    audioData: Buffer | ArrayBuffer,
  ): void {
    const session = this.activeSessions.get(socket.id);

    if (!session) {
      logger.warn('Audio chunk received for inactive session', {
        socketId: socket.id,
      });
      return;
    }

    // Barge-in: cancel any in-flight TTS when new speech arrives
    if (session.ttsInProgress && session.ttsAbort && !session.ttsAbort.signal.aborted) {
      session.ttsAbort.abort();
      session.ttsInProgress = false;
      socket.emit('tts-cancel');
      session.turnGuard += 1;
    }

    // Convert to Buffer for voice verification
    const audioBuffer = Buffer.isBuffer(audioData)
      ? audioData
      : Buffer.from(audioData);

    // Store audio chunks for voice verification (keep last 5 seconds)
    session.audioBuffer.push(audioBuffer);
    const maxBufferSize = 16000 * 2 * 5; // 5 seconds at 16kHz, 16-bit
    let totalSize = 0;
    for (let i = session.audioBuffer.length - 1; i >= 0; i--) {
      totalSize += session.audioBuffer[i].length;
      if (totalSize > maxBufferSize) {
        session.audioBuffer.splice(0, i);
        break;
      }
    }

    // Energy-based fallback VAD: if RMS is high, ensure barge-in is respected
    const rms = this.computeRms(audioBuffer);
    if (rms > 0.02 && session.ttsInProgress && session.ttsAbort && !session.ttsAbort.signal.aborted) {
      session.ttsAbort.abort();
      session.ttsInProgress = false;
      session.turnGuard += 1;
      socket.emit('tts-cancel');
    }

    // Route audio to current STT provider
    if (session.sttProvider === 'deepgram') {
      try {
        const data = Buffer.isBuffer(audioData) ? audioData.buffer : audioData;
        session.deepgramConnection.send(data);
      } catch (error) {
        logger.error('Failed to send audio chunk to Deepgram', {
          sessionId: session.sessionId,
          error,
        });
        this.handleSttFailure(session, 'deepgram', socket, 'send-error');
      }
    } else if (session.sttProvider === 'google' && this.googleSpeech) {
      if (!session.googleActive) {
        this.startGoogleStream(session.sessionId, session, socket, 'primary');
      }
      if (session.googleStream && (session.googleStream as any).writable) {
        try {
          (session.googleStream as any).write(audioBuffer);
        } catch (err) {
          logger.error('Failed to send audio to Google STT', { sessionId: session.sessionId, err });
          this.handleSttFailure(session, 'google', socket, 'send-error');
        }
      }
    }
  }

  private handleSttFailure(
    session: AudioSession,
    provider: 'deepgram' | 'google',
    socket: Socket,
    reason: string,
  ) {
    session.consecutiveSttFailures += 1;
    logger.warn('STT failure recorded', {
      sessionId: session.sessionId,
      provider,
      reason,
      failures: session.consecutiveSttFailures,
    });

    const threshold = this.sttFailureThreshold;
    const canFailoverToGoogle = this.googleSpeech && provider === 'deepgram';
    const canFailoverToDeepgram = provider === 'google';

    if (
      session.sttProvider === provider &&
      session.consecutiveSttFailures >= threshold &&
      (canFailoverToGoogle || canFailoverToDeepgram)
    ) {
      const target = provider === 'deepgram' ? 'google' : 'deepgram';
      this.switchSttProvider(session, socket, target, 'failover');
    }
  }

  private switchSttProvider(
    session: AudioSession,
    socket: Socket,
    target: 'deepgram' | 'google',
    reason: 'failover' | 'manual',
  ) {
    if (session.sttProvider === target) return;

    if (target === 'google') {
      if (!this.googleSpeech) {
        logger.warn('Requested switch to Google STT but client unavailable', {
          sessionId: session.sessionId,
        });
        return;
      }
      this.startGoogleStream(session.sessionId, session, socket, reason);
      session.sttProvider = 'google';
      session.consecutiveSttFailures = 0;
      socket.emit('stt-provider-changed', { provider: 'google', reason });
      logger.info('Switched STT provider to Google', {
        sessionId: session.sessionId,
        reason,
      });
      return;
    }

    if (target === 'deepgram') {
      // Disable google stream if active
      if (session.googleActive && session.googleStream) {
        try {
          (session.googleStream as any).end();
        } catch (e) {
          logger.warn('Failed to end Google stream during switch', { sessionId: session.sessionId, e });
        }
        session.googleActive = false;
      }
      session.sttProvider = 'deepgram';
      session.consecutiveSttFailures = 0;
      socket.emit('stt-provider-changed', { provider: 'deepgram', reason });
    logger.info('Switched STT provider to Deepgram', {
        sessionId: session.sessionId,
        reason,
      });
    }
  }

  private computeRms(buffer: Buffer): number {
    if (buffer.length < 2) return 0;
    let sumSquares = 0;
    let samples = 0;
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = buffer.readInt16LE(i);
      sumSquares += sample * sample;
      samples += 1;
      if (samples > 2000) break; // sample subset for speed
    }
    if (samples === 0) return 0;
    const meanSquare = sumSquares / samples;
    // normalize by int16 max
    return Math.sqrt(meanSquare) / 32768;
  }

  private async processConversationTurn(
    socket: Socket,
    session: AudioSession,
    userMessage: string,
    turnId: number,
  ): Promise<void> {
    const llmStartTime = Date.now();
    const latencyBudgetMs = 500; // target per-turn budget

    try {
      // Stream LLM response
      // Use low-latency config for voice dialogue
      const llmConfig = getLLMConfig('reasoning');
      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are Jarvis, a helpful AI assistant. Provide concise, natural responses suitable for voice conversation.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        stream: true,
        temperature: llmConfig.temperature,
        max_tokens: 150, // Keep short for voice (overrides config)
      });

      let fullResponse = '';
      let firstTokenTime: number | null = null;

      // Process streaming tokens
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            session.latencyMetrics.llm = firstTokenTime - llmStartTime;
          }
          fullResponse += content;
        }
      }

      logger.info('LLM Complete', {
        sessionId: session.sessionId,
        response: fullResponse,
        latency: Date.now() - llmStartTime,
      });

      // Emit LLM response to client if still current turn
      if (turnId === session.turnGuard) {
        socket.emit('llm-response', { response: fullResponse });
        // Convert to speech
        await this.synthesizeSpeech(socket, session, fullResponse, turnId);
      } else {
        logger.info('Skipping LLM response due to newer turn', { sessionId: session.sessionId, turnId, guard: session.turnGuard });
      }

      const totalLatency = Date.now() - session.startTime;
      if (totalLatency > latencyBudgetMs) {
        logger.warn('Voice turn exceeded latency budget', {
          sessionId: session.sessionId,
          totalLatency,
          budget: latencyBudgetMs,
          breakdown: { ...session.latencyMetrics },
        });
      }
    } catch (error) {
      logger.error('LLM processing failed', {
        sessionId: session.sessionId,
        error,
      });
      socket.emit('error', { message: 'Failed to generate response' });
    }
  }

  private async synthesizeSpeech(
    socket: Socket,
    session: AudioSession,
    text: string,
    turnId: number,
  ): Promise<void> {
    const ttsStartTime = Date.now();
    const abortController = new AbortController();
    session.ttsAbort = abortController;
    session.ttsInProgress = true;
    let ttsStarted = false;

    try {
      // Check if ElevenLabs is available
      if (!this.elevenlabs) {
        logger.warn('TTS unavailable - ElevenLabs not initialized', {
          sessionId: session.sessionId,
        });
        socket.emit('voice-error', { message: 'Text-to-speech unavailable' });
        socket.emit('audio-complete');
        return;
      }

      // Use ElevenLabs streaming API for low latency
      // Use ElevenLabs TextToSpeech.convert with stream option
      const audioStream = await this.elevenlabs.textToSpeech.convert(
        process.env.ELEVENLABS_VOICE_ID || 'EfwLzp3a6IkyvrMSx3oD',
        {
          text,
          modelId: 'eleven_turbo_v2_5', // Optimized for latency
          outputFormat: 'mp3_44100_128',
          voiceSettings: {
            similarityBoost: 0.75,
          },
        },
      );

      let firstChunkTime: number | null = null;

      // Stream audio chunks to client
      for await (const chunk of audioStream) {
        if (abortController.signal.aborted || turnId !== session.turnGuard) {
          logger.info('TTS canceled due to barge-in', { sessionId: session.sessionId });
          break;
        }
        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          session.latencyMetrics.tts = firstChunkTime - ttsStartTime;
        }
        ttsStarted = true;
        socket.emit('audio-chunk', { audio: chunk });
      }

      // Log complete latency metrics
      logger.info('Voice Turn Complete', {
        sessionId: session.sessionId,
        latency: {
          stt: session.latencyMetrics.stt,
          llm: session.latencyMetrics.llm,
          tts: session.latencyMetrics.tts,
          total: Date.now() - session.startTime,
        },
      });

      if (!abortController.signal.aborted) {
        socket.emit('audio-complete');
      }
    } catch (error) {
      logger.error('TTS synthesis failed', {
        sessionId: session.sessionId,
        error,
      });
      socket.emit('voice-error', { message: 'Failed to synthesize speech' });
      socket.emit('audio-complete');
    } finally {
      session.ttsInProgress = false;
      session.ttsAbort = undefined;
      if (!ttsStarted && !abortController.signal.aborted && turnId === session.turnGuard) {
        socket.emit('voice-error', { message: 'TTS did not start; reply is text-only' });
      }
    }
  }

  private startGoogleStream(
    sessionId: string,
    session: AudioSession,
    socket: Socket,
    reason: 'primary' | 'failover' | 'manual' = 'failover',
  ) {
    if (!this.googleSpeech) return;
    try {
      const request = {
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
        },
        interimResults: true,
      };
      const recognizeStream = this.googleSpeech
        .streamingRecognize(request)
        .on('error', (err: Error) => {
          logger.error('Google STT error', { sessionId, err });
          session.googleActive = false;
          this.handleSttFailure(session, 'google', socket, 'provider-error');
        })
        .on('data', (data: any) => {
          if (session.sttProvider !== 'google') {
            return;
          }
          const result = data.results?.[0];
          if (!result) return;
          const transcript = result.alternatives?.[0]?.transcript || '';
          const isFinal = !!result.isFinal;

          const cleanedTranscript = transcript.trim();
          if (cleanedTranscript.length > 0) {
            if (session.ttsInProgress && session.ttsAbort && !session.ttsAbort.signal.aborted) {
              session.ttsAbort.abort();
              session.ttsInProgress = false;
              session.turnGuard += 1;
              socket.emit('tts-cancel');
            }
          }

          const shouldEarlyProcess =
            cleanedTranscript.length > 8 &&
            (cleanedTranscript.endsWith('.') ||
              cleanedTranscript.endsWith('?') ||
              cleanedTranscript.endsWith('!'));

          if (cleanedTranscript && (isFinal || shouldEarlyProcess)) {
            session.latencyMetrics.stt = Date.now() - session.startTime;
            session.consecutiveSttFailures = 0;
            logger.info('Google STT Complete', { sessionId, transcript: cleanedTranscript });
            void this.processConversationTurn(socket, session, cleanedTranscript, session.turnGuard);
            session.audioBuffer = [];
          }
        });

      session.googleStream = recognizeStream;
      session.googleActive = true;
      session.consecutiveSttFailures = 0;
      logger.warn('Enabled Google STT', { sessionId, reason });
    } catch (err) {
      logger.error('Failed to start Google STT fallback', { sessionId, err });
    }
  }

  private handleEndStream(socket: Socket): void {
    const session = this.activeSessions.get(socket.id);

    if (session) {
      // Close Deepgram connection
      session.deepgramConnection.finish();
      if (session.googleActive && session.googleStream) {
        try {
          (session.googleStream as any).end();
        } catch (e) {
          logger.warn('Failed to end Google STT stream', { sessionId: session.sessionId, e });
        }
        session.googleActive = false;
      }

      logger.info('Audio stream ended', {
        sessionId: session.sessionId,
        duration: Date.now() - session.startTime,
      });
    }

    this.activeSessions.delete(socket.id);
    socket.emit('stream-ended');
  }

  private handleDisconnect(socket: Socket): void {
    const session = this.activeSessions.get(socket.id);

    if (session) {
      session.deepgramConnection.finish();
      if (session.googleActive && session.googleStream) {
        try {
          (session.googleStream as any).end();
        } catch (e) {
          logger.warn('Failed to end Google STT stream on disconnect', { sessionId: session.sessionId, e });
        }
        session.googleActive = false;
      }
      this.activeSessions.delete(socket.id);

      logger.info('Client disconnected', {
        sessionId: session.sessionId,
        totalDuration: Date.now() - session.startTime,
      });
    }
  }

  // Health check method
  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

export default AudioStreamingService;
