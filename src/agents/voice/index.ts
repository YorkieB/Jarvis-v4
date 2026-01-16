import { BaseAgent } from '../base-agent';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createClient } from '@deepgram/sdk';
import logger from '../../utils/logger';

// Lazy import to avoid mandatory install when Google fallback is unused
let GoogleSpeechClient: typeof import('@google-cloud/speech').SpeechClient | null = null;

export class VoiceAgent extends BaseAgent {
  protected agentType = 'voice';
  protected permissions = ['read:audio_settings'];

  private elevenLabs: ElevenLabsClient;
  private deepgram: ReturnType<typeof createClient>;
  private googleSpeech: import('@google-cloud/speech').SpeechClient | null = null;

  constructor() {
    super();
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

    // Initialize Google STT only if credentials are provided
    const hasGoogleCreds =
      !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (!!process.env.GOOGLE_CLOUD_PROJECT_ID &&
        !!process.env.GOOGLE_CLOUD_CLIENT_EMAIL &&
        !!process.env.GOOGLE_CLOUD_PRIVATE_KEY);

    if (hasGoogleCreds) {
      try {
        // Dynamically require to keep dependency optional
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        GoogleSpeechClient = require('@google-cloud/speech').SpeechClient;
        this.googleSpeech = new GoogleSpeechClient();
        logger.info('✅ Google STT fallback initialized');
      } catch (error) {
        logger.warn('⚠️ Google STT fallback not available', { error });
        this.googleSpeech = null;
      }
    } else {
      logger.info('Google STT fallback not configured (missing credentials)');
    }
  }

  async textToSpeech(text: string, voiceId?: string): Promise<Buffer> {
    const voice = voiceId || process.env.JARVIS_VOICE_ID!;

    const audio = await this.elevenLabs.textToSpeech.convert(voice, {
      text,
      modelId: 'eleven_multilingual_v2',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
      },
    });

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async speechToText(audioBuffer: Buffer): Promise<string> {
    // Try Deepgram first with a light retry
    const transcript = await this.transcribeWithDeepgram(audioBuffer);
    if (transcript) {
      return transcript;
    }

    // Fallback to Google STT if configured
    if (this.googleSpeech) {
      const fallback = await this.transcribeWithGoogle(audioBuffer);
      if (fallback) {
        return fallback;
      }
    }

    throw new Error('Speech-to-text failed: no provider succeeded');
  }

  /**
   * Primary STT via Deepgram with one retry on transient errors.
   */
  private async transcribeWithDeepgram(
    audioBuffer: Buffer,
  ): Promise<string | null> {
    const attempt = async (): Promise<string> => {
      const { result, error } =
        await this.deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
          model: 'nova-2',
          smart_format: true,
          language: 'en',
          punctuate: true,
        });

      if (error) throw error;
      const transcript = result.results.channels[0].alternatives[0].transcript;
      return transcript;
    };

    try {
      const transcript = await attempt();
      logger.debug('Deepgram STT succeeded');
      return transcript;
    } catch (error) {
      logger.warn('Deepgram STT failed, retrying once', { error });
      try {
        const transcript = await attempt();
        logger.debug('Deepgram STT succeeded on retry');
        return transcript;
      } catch (finalError) {
        logger.error('Deepgram STT failed after retry', { error: finalError });
        return null;
      }
    }
  }

  /**
   * Fallback STT via Google Cloud Speech-to-Text.
   */
  private async transcribeWithGoogle(
    audioBuffer: Buffer,
  ): Promise<string | null> {
    if (!this.googleSpeech) return null;

    try {
      const [response] = await this.googleSpeech.recognize({
        audio: { content: audioBuffer.toString('base64') },
        config: {
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          // Best-effort defaults; audio format may vary from clients
        },
      });

      const transcript =
        response.results
          ?.flatMap((r) => r.alternatives || [])
          .map((alt) => alt.transcript)
          .join(' ')
          .trim() || '';

      if (transcript) {
        logger.info('Google STT fallback succeeded');
        return transcript;
      }

      logger.warn('Google STT returned empty transcript');
      return null;
    } catch (error) {
      logger.error('Google STT fallback failed', { error });
      return null;
    }
  }
}
