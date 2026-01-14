/**
 * Voice Authentication Service
 * Handles voiceprint enrollment, verification, and management
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@deepgram/sdk';
import logger from '../utils/logger';
import * as crypto from 'crypto';

interface VoiceVerificationResult {
  verified: boolean;
  confidence: number;
  message?: string;
}

interface VoiceprintFeatures {
  embedding: number[];
  sampleDuration: number;
  sampleQuality: number;
}

class VoiceAuthService {
  private prisma: PrismaClient;
  private deepgram: ReturnType<typeof createClient>;
  private readonly MIN_ENROLLMENT_DURATION = 10; // seconds
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.85;
  private readonly REQUIRED_SAMPLES = 3; // Minimum samples for enrollment

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  }

  /**
   * Extract voice features from audio buffer
   * This is a simplified implementation - in production, use proper voiceprint extraction
   */
  private async extractVoiceFeatures(
    audioBuffer: Buffer,
  ): Promise<VoiceprintFeatures> {
    // TODO: Implement proper voiceprint extraction using ML model
    // For now, using simplified feature extraction based on audio characteristics
    
    // Calculate basic audio features as placeholder
    // In production, use models like wav2vec2, SpeechBrain, or dedicated voice biometrics API
    
    const sampleRate = 16000; // Assume 16kHz sample rate
    const duration = audioBuffer.length / (sampleRate * 2); // 16-bit samples
    
    // Simplified feature vector (512 dimensions)
    // In production, replace with actual ML model embeddings
    const embedding = new Array(512).fill(0).map(() => Math.random() * 2 - 1);
    
    // Normalize embedding
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    const normalizedEmbedding = embedding.map((val) => val / magnitude);

    return {
      embedding: normalizedEmbedding,
      sampleDuration: duration,
      sampleQuality: duration >= this.MIN_ENROLLMENT_DURATION ? 1.0 : 0.5,
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Enroll user voiceprint from audio samples
   */
  async enrollVoiceprint(
    userId: string,
    audioSamples: Buffer[],
  ): Promise<void> {
    try {
      // Validate samples
      if (audioSamples.length < this.REQUIRED_SAMPLES) {
        throw new Error(
          `At least ${this.REQUIRED_SAMPLES} audio samples required for enrollment`,
        );
      }

      // Extract features from all samples
      const features = await Promise.all(
        audioSamples.map((sample) => this.extractVoiceFeatures(sample)),
      );

      // Validate sample quality
      const totalDuration = features.reduce(
        (sum, f) => sum + f.sampleDuration,
        0,
      );
      if (totalDuration < this.MIN_ENROLLMENT_DURATION) {
        throw new Error(
          `Total audio duration must be at least ${this.MIN_ENROLLMENT_DURATION} seconds`,
        );
      }

      // Average embeddings from all samples for better accuracy
      const averagedEmbedding = new Array(512).fill(0);
      features.forEach((f) => {
        f.embedding.forEach((val, idx) => {
          averagedEmbedding[idx] += val / features.length;
        });
      });

      // Normalize averaged embedding
      const magnitude = Math.sqrt(
        averagedEmbedding.reduce((sum, val) => sum + val * val, 0),
      );
      const normalizedEmbedding = averagedEmbedding.map(
        (val) => val / magnitude,
      );

      // Store voiceprint in database using raw SQL with pgvector
      // Prisma doesn't support vector type directly, so we use raw SQL
      const embeddingString = `[${normalizedEmbedding.join(',')}]`;
      
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "Voiceprint" (id, "userId", embedding, "enrolledAt", "updatedAt", "isActive", confidence)
        VALUES (
          gen_random_uuid()::text,
          $1::text,
          $2::vector,
          NOW(),
          NOW(),
          true,
          $3
        )
        ON CONFLICT ("userId") 
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          "updatedAt" = NOW(),
          "isActive" = true
      `, userId, embeddingString, this.MIN_CONFIDENCE_THRESHOLD);

      logger.info('Voiceprint enrolled successfully', { userId });
    } catch (error) {
      logger.error('Failed to enroll voiceprint', { userId, error });
      throw error;
    }
  }

  /**
   * Verify if audio matches enrolled voiceprint
   */
  async verifyVoice(
    userId: string,
    audioBuffer: Buffer,
  ): Promise<VoiceVerificationResult> {
    try {
      // Get user's voiceprint using raw SQL
      const voiceprint = await this.prisma.$queryRawUnsafe<Array<{
        embedding: string;
        confidence: number;
        isActive: boolean;
      }>>(
        `SELECT embedding::text as embedding, confidence, "isActive"
         FROM "Voiceprint"
         WHERE "userId" = $1::text AND "isActive" = true
         LIMIT 1`,
        userId,
      );

      if (!voiceprint || voiceprint.length === 0) {
        return {
          verified: false,
          confidence: 0,
          message: 'Voiceprint not enrolled. Please enroll your voice first.',
        };
      }

      const storedEmbedding = JSON.parse(voiceprint[0].embedding) as number[];
      const threshold = voiceprint[0].confidence;

      // Extract features from incoming audio
      const features = await this.extractVoiceFeatures(audioBuffer);

      // Calculate similarity
      const similarity = this.cosineSimilarity(
        features.embedding,
        storedEmbedding,
      );

      const verified = similarity >= threshold;

      logger.info('Voice verification result', {
        userId,
        similarity,
        threshold,
        verified,
      });

      return {
        verified,
        confidence: similarity,
        message: verified
          ? 'Voice verified'
          : `Voice verification failed. Confidence: ${(similarity * 100).toFixed(1)}% (required: ${(threshold * 100).toFixed(1)}%)`,
      };
    } catch (error) {
      logger.error('Voice verification error', { userId, error });
      return {
        verified: false,
        confidence: 0,
        message: 'Voice verification error occurred',
      };
    }
  }

  /**
   * Update existing voiceprint
   */
  async updateVoiceprint(
    userId: string,
    audioSamples: Buffer[],
  ): Promise<void> {
    // Re-enroll with new samples
    await this.enrollVoiceprint(userId, audioSamples);
    logger.info('Voiceprint updated', { userId });
  }

  /**
   * Delete voiceprint for user
   */
  async deleteVoiceprint(userId: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "Voiceprint"
         SET "isActive" = false, "updatedAt" = NOW()
         WHERE "userId" = $1::text`,
        userId,
      );
      logger.info('Voiceprint deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete voiceprint', { userId, error });
      throw error;
    }
  }

  /**
   * Check if user has enrolled voiceprint
   */
  async hasVoiceprint(userId: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count
         FROM "Voiceprint"
         WHERE "userId" = $1::text AND "isActive" = true`,
        userId,
      );
      return (result[0]?.count || 0) > 0;
    } catch (error) {
      logger.error('Failed to check voiceprint', { userId, error });
      return false;
    }
  }
}

export default VoiceAuthService;
export type { VoiceVerificationResult, VoiceprintFeatures };
