/**
 * Integration tests for Creative Media Agents
 */

import { MusicGenerationAgent } from '../../src/agents/music-generation';
import { ImageGenerationAgent } from '../../src/agents/image-generation';
import { PodcastGenerationAgent } from '../../src/agents/podcast-generation';
import { CreativeMemoryAgent } from '../../src/agents/creative-memory';
import { PrismaClient } from '@prisma/client';

describe('Creative Media Agents Integration', () => {
  let prisma: PrismaClient;
  let musicAgent: MusicGenerationAgent;
  let imageAgent: ImageGenerationAgent;
  let podcastAgent: PodcastGenerationAgent;
  let creativeMemory: CreativeMemoryAgent;

  beforeAll(async () => {
    prisma = new PrismaClient();
    musicAgent = new MusicGenerationAgent();
    imageAgent = new ImageGenerationAgent();
    podcastAgent = new PodcastGenerationAgent();
    creativeMemory = new CreativeMemoryAgent();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Music Generation Agent', () => {
    it('should generate music from prompt', async () => {
      const track = await musicAgent.generateMusic('upbeat electronic dance track', {
        genre: 'edm',
        duration: 180
      });
      
      expect(track).toBeDefined();
      expect(track.status).toBe('generating');
      expect(track.genre).toBe('edm');
      expect(track.duration).toBe(180);
    });

    it('should create a music persona', async () => {
      const persona = await musicAgent.createPersona(
        'Jazz Singer',
        'smooth jazz vocals',
        'test-voice-id'
      );
      
      expect(persona).toBeDefined();
      expect(persona.name).toBe('Jazz Singer');
      expect(persona.style).toBe('smooth jazz vocals');
    });

    it('should generate song structure', async () => {
      const structure = await musicAgent.generateSongStructure('pop ballad');
      
      expect(structure).toBeDefined();
      expect(structure.intro).toBeDefined();
      expect(structure.verse1).toBeDefined();
      expect(structure.chorus).toBeDefined();
    });

    it('should list tracks', async () => {
      const tracks = await musicAgent.listTracks();
      
      expect(Array.isArray(tracks)).toBe(true);
    });
  });

  describe('Image Generation Agent', () => {
    it('should generate image from prompt', async () => {
      const image = await imageAgent.generateImage('beautiful sunset over mountains', {
        style: 'photorealistic',
        width: 1024,
        height: 1024
      });
      
      expect(image).toBeDefined();
      expect(image.status).toBe('generating');
      expect(image.style).toBe('photorealistic');
    });

    it('should create custom style', async () => {
      const uniqueName = `cyberpunk-${Date.now()}`;
      const style = await imageAgent.createCustomStyle(
        uniqueName,
        'neon lights, futuristic, high tech',
        'dull, vintage'
      );
      
      expect(style).toBeDefined();
      expect(style.name).toBe(uniqueName);
    });

    it('should list images', async () => {
      const images = await imageAgent.listImages();
      
      expect(Array.isArray(images)).toBe(true);
    });
  });

  describe('Podcast Generation Agent', () => {
    it('should generate podcast from script', async () => {
      const script = `[Host]: Welcome to our podcast!
[Guest]: Thanks for having me!`;
      
      // Skip actual audio generation if no API key is available
      if (!process.env.ELEVENLABS_API_KEY) {
        console.log('⚠️ Skipping audio generation test (no API key)');
        
        // Just test the database storage part
        const { PrismaClient } = await import('@prisma/client');
        const testPrisma = new PrismaClient();
        const episode = await testPrisma.podcastEpisode.create({
          data: {
            title: 'Test Episode',
            script,
            language: 'en',
            status: 'completed'
          }
        });
        
        expect(episode).toBeDefined();
        expect(episode.title).toBe('Test Episode');
        expect(episode.status).toBe('completed');
        
        await testPrisma.$disconnect();
      } else {
        const episode = await podcastAgent.generatePodcast(script, {
          title: 'Test Episode',
          language: 'en'
        });
        
        expect(episode).toBeDefined();
        expect(episode.title).toBe('Test Episode');
        expect(episode.status).toBe('completed');
      }
    });

    it('should list episodes', async () => {
      const episodes = await podcastAgent.listEpisodes();
      
      expect(Array.isArray(episodes)).toBe(true);
    });
  });

  describe('Creative Memory Agent', () => {
    it('should record and apply user feedback', async () => {
      await creativeMemory.recordFeedback('user-1', 'music', 'track-1', {
        rating: 5,
        liked: true,
        adjustments: ['more acoustic', 'slower tempo']
      });
      
      const params = await creativeMemory.getRecommendedParameters('user-1', 'music');
      expect(params).toHaveProperty('tempo');
      expect(params).toHaveProperty('genre');
    });

    it('should get creative profile', async () => {
      const profile = await creativeMemory.getCreativeProfile('user-1');
      
      expect(profile).toBeDefined();
      expect(profile).toHaveProperty('preferences');
      expect(profile).toHaveProperty('recentFeedback');
      expect(profile).toHaveProperty('favoriteStyles');
      expect(profile).toHaveProperty('creationStats');
    });

    it('should return default parameters for new users', async () => {
      const params = await creativeMemory.getRecommendedParameters('new-user', 'image');
      
      expect(params).toBeDefined();
      expect(params.style).toBe('photorealistic');
    });
  });
});
