import { BaseAgent } from '../base-agent';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export class VoiceAgent extends BaseAgent {
  protected agentType = 'voice';
  protected permissions = ['read:audio_settings'];
  
  private elevenLabs: ElevenLabsClient;
  
  constructor() {
    super();
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
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
    // TODO: Implement Deepgram integration
    return 'transcribed text';
  }
}
