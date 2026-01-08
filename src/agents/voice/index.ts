import { BaseAgent } from '../base-agent';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export class VoiceAgent extends BaseAgent {
  protected agentType = 'voice';
  protected permissions = ['read:audio_settings'];
  
  private elevenLabs: ElevenLabsClient;
    private deepgram: any;
  
  constructor() {
    super();
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
        this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  }
  
  async textToSpeech(text: string, voiceId?: string): Promise<Buffer> {
    const voice = voiceId || process.env.JARVIS_VOICE_ID!;
    
    const audio = await this.elevenLabs.textToSpeech.convert(voice, {
      text,
      modelId: 'eleven_multilingual_v2',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75
      }
    });
    
    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }
  
  async speechToText(audioBuffer: Buffer): Promise<string> {
    try {
      // Use Deepgram Nova-2 model for high accuracy STT
      const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
          language: 'en',
          punctuate: true,
        }
      );

      if (error) throw error;

      const transcript = result.results.channels[0].alternatives[0].transcript;
      return transcript;
    } catch (error) {
      console.error('Deepgram STT error:', error);
      // TODO: Fallback to Google STT if Deepgram fails
      throw new Error(`Speech-to-text failed: ${error}`);
    }  }
}
