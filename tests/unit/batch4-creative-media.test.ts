/**
 * Tests for Batch 4: Creative Media Agents
 * These tests verify that the agents are properly instantiated and extend BaseAgent
 */

import { MusicGenerationAgent } from '../../src/agents/music-generation/index';
import { ImageGenerationAgent } from '../../src/agents/image-generation/index';
import { PodcastGenerationAgent } from '../../src/agents/podcast-generation/index';
import { CreativeMemoryAgent } from '../../src/agents/creative-memory/index';

// Mock Prisma Client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    musicTrack: {
      create: jest.fn().mockResolvedValue({ id: 'test-track-id' }),
      findMany: jest.fn().mockResolvedValue([])
    },
    musicPersona: {
      create: jest.fn().mockResolvedValue({ id: 'test-persona-id' }),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    generatedImage: {
      create: jest.fn().mockResolvedValue({ id: 'test-image-id' }),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    podcastEpisode: {
      create: jest.fn().mockResolvedValue({ id: 'test-podcast-id' }),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    creativePreferences: {
      create: jest.fn().mockResolvedValue({ id: 'test-prefs-id', preferences: {} }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'test-prefs-id', preferences: {} })
    },
    creativeFeedback: {
      create: jest.fn().mockResolvedValue({ id: 'test-feedback-id' }),
      findMany: jest.fn().mockResolvedValue([])
    }
  }))
}));

// Mock ElevenLabs Client
jest.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: jest.fn().mockImplementation(() => ({
    textToSpeech: {
      convert: jest.fn().mockResolvedValue([])
    }
  }))
}));

describe('Batch 4: Creative Media Agents', () => {
  describe('MusicGenerationAgent', () => {
    it('should instantiate successfully', () => {
      const agent = new MusicGenerationAgent();
      expect(agent).toBeDefined();
    });

    it('should have correct agent type', () => {
      const agent = new MusicGenerationAgent();
      expect((agent as any).agentType).toBe('music-generation');
    });

    it('should have correct permissions', () => {
      const agent = new MusicGenerationAgent();
      expect((agent as any).permissions).toEqual(['write:music', 'read:music']);
    });
  });

  describe('ImageGenerationAgent', () => {
    it('should instantiate successfully', () => {
      const agent = new ImageGenerationAgent();
      expect(agent).toBeDefined();
    });

    it('should have correct agent type', () => {
      const agent = new ImageGenerationAgent();
      expect((agent as any).agentType).toBe('image-generation');
    });

    it('should have correct permissions', () => {
      const agent = new ImageGenerationAgent();
      expect((agent as any).permissions).toEqual(['write:images', 'read:images']);
    });
  });

  describe('PodcastGenerationAgent', () => {
    it('should instantiate successfully', () => {
      const agent = new PodcastGenerationAgent();
      expect(agent).toBeDefined();
    });

    it('should have correct agent type', () => {
      const agent = new PodcastGenerationAgent();
      expect((agent as any).agentType).toBe('podcast-generation');
    });

    it('should have correct permissions', () => {
      const agent = new PodcastGenerationAgent();
      expect((agent as any).permissions).toEqual(['write:podcasts', 'read:podcasts']);
    });
  });

  describe('CreativeMemoryAgent', () => {
    it('should instantiate successfully', () => {
      const agent = new CreativeMemoryAgent();
      expect(agent).toBeDefined();
    });

    it('should have correct agent type', () => {
      const agent = new CreativeMemoryAgent();
      expect((agent as any).agentType).toBe('creative-memory');
    });

    it('should have correct permissions', () => {
      const agent = new CreativeMemoryAgent();
      expect((agent as any).permissions).toEqual(['read:preferences', 'write:preferences']);
    });
  });
});
