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
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import logger from '../utils/logger';
interface AudioSession {
  sessionId: string;
  deepgramConnection: any;
  transcriptBuffer: string;
  startTime: number;
  latencyMetrics: {
    stt: number;
    llm: number;
    tts: number;
  };
}

class AudioStreamingService {
  private io: SocketIOServer;
  private deepgram: any;
  private openai: OpenAI;
  private elevenlabs: ElevenLabsClient;
  private activeSessions: Map<string, AudioSession>;

  constructor(httpServer: HttpServer) {
    // Initialize Socket.IO with CORS
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // Configure appropriately for production
        methods: ['GET', 'POST'],
      },
    });

    // Initialize API clients
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    this.activeSessions = new Map();

    this.setupSocketHandlers();
    logger.info('Audio Streaming Service initialized');
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
        interim_results: false,
        endpointing: 300, // ms of silence to detect end of utterance
      });

      // Initialize session
      const session: AudioSession = {
        sessionId,
        deepgramConnection,
        transcriptBuffer: '',
        startTime,
        latencyMetrics: { stt: 0, llm: 0, tts: 0 },
      };

      this.activeSessions.set(sessionId, session);

      // Handle Deepgram transcription events
      deepgramConnection.on(
        LiveTranscriptionEvents.Transcript,
        async (data: any) => {
          const transcript = data.channel.alternatives[0].transcript;

          if (transcript && data.is_final) {
            const sttLatency = Date.now() - startTime;
            session.latencyMetrics.stt = sttLatency;

            logger.info('STT Complete', {
              sessionId,
              transcript,
              latency: sttLatency,
            });

            // Emit transcript to client
            socket.emit('transcription', { transcript });

            // Process through LLM and TTS
            await this.processConversationTurn(socket, session, transcript);
          }
        },
      );

      deepgramConnection.on(LiveTranscriptionEvents.Error, (error: any) => {
        logger.error('Deepgram error', { sessionId, error });
        socket.emit('error', { message: 'Speech recognition error' });
      });

      socket.emit('stream-started', { sessionId });
      logger.info('Audio stream started', { sessionId });
    } catch (error) {
      logger.error('Failed to start audio stream', { sessionId, error });
      socket.emit('error', { message: 'Failed to initialize audio stream' });
    }
  }

  private handleAudioChunk(socket: Socket, audioData: Buffer): void {
    const session = this.activeSessions.get(socket.id);

    if (!session) {
      logger.warn('Audio chunk received for inactive session', {
        socketId: socket.id,
      });
      return;
    }

    // Send audio chunk to Deepgram
    try {
      session.deepgramConnection.send(audioData);
    } catch (error) {
      logger.error('Failed to send audio chunk to Deepgram', {
        sessionId: session.sessionId,
        error,
      });
    }
  }

  private async processConversationTurn(
    socket: Socket,
    session: AudioSession,
    userMessage: string,
  ): Promise<void> {
    const llmStartTime = Date.now();

    try {
      // Stream LLM response
      const stream = await this.openai.chat.completions.create({
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview',
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
        max_tokens: 150,
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

      // Emit LLM response to client
      socket.emit('llm-response', { response: fullResponse });

      // Convert to speech
      await this.synthesizeSpeech(socket, session, fullResponse);
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
  ): Promise<void> {
    const ttsStartTime = Date.now();

    try {
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
        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          session.latencyMetrics.tts = firstChunkTime - ttsStartTime;
        }
        socket.emit('audio-response', chunk);
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

      socket.emit('audio-complete');
    } catch (error) {
      logger.error('TTS synthesis failed', {
        sessionId: session.sessionId,
        error,
      });
      socket.emit('error', { message: 'Failed to synthesize speech' });
    }
  }

  private handleEndStream(socket: Socket): void {
    const session = this.activeSessions.get(socket.id);

    if (session) {
      // Close Deepgram connection
      session.deepgramConnection.finish();

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
