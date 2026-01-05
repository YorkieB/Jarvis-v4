import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

export class PodcastGenerationAgent extends BaseAgent {
  protected agentType = 'podcast-generation';
  protected permissions = ['write:podcasts', 'read:podcasts'];
  
  private prisma: PrismaClient;
  private elevenLabs: ElevenLabsClient;
  
  constructor() {
    super();
    this.prisma = new PrismaClient();
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
  }
  
  async generatePodcast(params: {
    userId: string;
    title: string;
    script: string;
    speakers?: { name: string; voiceId: string; }[];
    includeMusic?: boolean;
  }): Promise<any> {
    console.log(`🎙️ Generating podcast: "${params.title}"`);
    
    // Parse script for speakers
    const parsedScript = this.parseScript(params.script);
    
    // Generate audio for each segment
    const audioSegments = [];
    
    for (const segment of parsedScript) {
      if (segment.type === 'speech') {
        const speaker = params.speakers?.find(s => s.name === segment.speaker);
        const voiceId = speaker?.voiceId || process.env.DEFAULT_VOICE_ID!;
        
        console.log(`🗣️ Generating speech for ${segment.speaker}: "${segment.text.substring(0, 50)}..."`);
        
        const audio = await this.elevenLabs.textToSpeech.convert(voiceId, {
          text: segment.text,
          modelId: 'eleven_multilingual_v2'
        });
        
        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of audio) {
          chunks.push(chunk);
        }
        
        audioSegments.push({
          type: 'speech',
          speaker: segment.speaker,
          audio: Buffer.concat(chunks)
        });
      } else if (segment.type === 'music' && params.includeMusic) {
        // TODO: Get background music
        audioSegments.push({
          type: 'music',
          duration: segment.duration
        });
      }
    }
    
    // TODO: Mix all audio segments together
    const outputPath = `./generated-podcasts/podcast-${Date.now()}.mp3`;
    
    const podcast = await this.prisma.podcastEpisode.create({
      data: {
        userId: params.userId,
        title: params.title,
        script: params.script,
        filePath: outputPath,
        duration: 0, // TODO: Calculate from audio
        speakers: params.speakers?.map(s => s.name) || []
      }
    });
    
    console.log(`✅ Podcast generated: ${podcast.id}`);
    return podcast;
  }
  
  private parseScript(script: string): any[] {
    const segments: any[] = [];
    const lines = script.split('\n');
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      // Detect speaker format: "Speaker: text"
      const speakerMatch = line.match(/^([A-Za-z\s]+):\s*(.+)$/);
      
      if (speakerMatch) {
        segments.push({
          type: 'speech',
          speaker: speakerMatch[1].trim(),
          text: speakerMatch[2].trim()
        });
      } else if (line.startsWith('[MUSIC]')) {
        segments.push({
          type: 'music',
          duration: 5
        });
      } else {
        // Default to narrator
        segments.push({
          type: 'speech',
          speaker: 'Narrator',
          text: line.trim()
        });
      }
    }
    
    return segments;
  }
  
  async localizePodcast(podcastId: string, targetLanguage: string): Promise<any> {
    const podcast = await this.prisma.podcastEpisode.findUnique({
      where: { id: podcastId }
    });
    
    if (!podcast) throw new Error('Podcast not found');
    
    console.log(`🌍 Localizing podcast to ${targetLanguage}`);
    
    // TODO: Translate script using GPT-4
    // TODO: Regenerate audio in target language
    
    const localized = await this.prisma.podcastEpisode.create({
      data: {
        userId: podcast.userId,
        title: `${podcast.title} (${targetLanguage})`,
        script: podcast.script, // TODO: Translate
        filePath: `./generated-podcasts/podcast-${Date.now()}-${targetLanguage}.mp3`,
        duration: podcast.duration,
        speakers: podcast.speakers,
        language: targetLanguage,
        parentPodcastId: podcastId
      }
    });
    
    return localized;
  }
}
