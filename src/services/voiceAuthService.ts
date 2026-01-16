/**
 * Voice Authentication Service
 * Handles voiceprint enrollment, verification, and management
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as ort from 'onnxruntime-node';
import logger from '../utils/logger';
import { Buffer } from 'buffer';

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
  private readonly externalEmbeddingEndpoint = process.env.SPEAKER_EMBEDDING_ENDPOINT || '';
  private readonly externalEmbeddingApiKey = process.env.SPEAKER_EMBEDDING_API_KEY || '';
  private readonly speakerEncoderProvider =
    (process.env.SPEAKER_ENCODER_PROVIDER || 'onnx').toLowerCase();
  private readonly targetEmbeddingDim =
    parseInt(process.env.SPEAKER_EMBEDDING_DIM || '192', 10) || 192;
  private readonly onnxModelPath =
    process.env.SPEAKER_ENCODER_PATH ||
    path.resolve(process.cwd(), 'models', 'speaker', 'ecapa.onnx');
  private onnxSession: ort.InferenceSession | null = null;
  private onnxInputName: string | null = null;
  private onnxHealthy = true;
  private externalEmbeddingHealthy = true;
  private lastExternalSuccess: number | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  }

  /**
   * Lazy-load ONNX speaker encoder (CPU) if configured.
   */
  private async getOnnxSession(): Promise<ort.InferenceSession | null> {
    if (this.speakerEncoderProvider !== 'onnx') return null;
    if (this.onnxSession) return this.onnxSession;

    try {
      await fs.promises.access(this.onnxModelPath, fs.constants.R_OK);
    } catch (err) {
      this.onnxHealthy = false;
      logger.warn('ONNX speaker encoder file not accessible', {
        path: this.onnxModelPath,
        error: err,
      });
      return null;
    }

    try {
      this.onnxSession = await ort.InferenceSession.create(this.onnxModelPath, {
        executionProviders: ['cpuExecutionProvider'],
      });
      const inputNames = Object.keys(this.onnxSession.inputMetadata);
      this.onnxInputName = inputNames[0] || null;
      this.onnxHealthy = true;
      logger.info('ONNX speaker encoder loaded', { path: this.onnxModelPath });
      return this.onnxSession;
    } catch (error) {
      this.onnxHealthy = false;
      logger.error('Failed to initialize ONNX speaker encoder', { error });
      return null;
    }
  }

  private pcmToFloat32(audioBuffer: Buffer): Float32Array {
    const sampleCount = Math.floor(audioBuffer.length / 2);
    const output = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      output[i] = audioBuffer.readInt16LE(i * 2) / 32768;
    }
    return output;
  }

  /**
   * Run ONNX-based speaker encoder. Returns normalized embedding or null.
   */
  private async runOnnxEmbedding(audioBuffer: Buffer): Promise<number[] | null> {
    const session = await this.getOnnxSession();
    if (!session || !this.onnxInputName) return null;

    try {
      const waveform = this.pcmToFloat32(audioBuffer);
      const tensor = new ort.Tensor('float32', waveform, [1, waveform.length]);
      const output = await session.run({ [this.onnxInputName]: tensor });
      const outputKeys = Object.keys(output);
      const outputKey = outputKeys[0];
      if (!outputKey) throw new Error('ONNX output name not found');
      const embeddingTensor = output[outputKey];
      const raw = Array.from(embeddingTensor.data as number[] | Float32Array);
      const normalized = this.normalizeEmbeddingDim(raw, this.targetEmbeddingDim);
      this.onnxHealthy = true;
      return normalized;
    } catch (error) {
      this.onnxHealthy = false;
      logger.warn('ONNX speaker encoder inference failed', { error });
      return null;
    }
  }

  /**
   * Attempt to fetch embedding from an external speaker model service (e.g., ECAPA/TitaNet)
   * Expects response: { embedding: number[] }
   */
  private async fetchExternalEmbedding(audioBuffer: Buffer): Promise<number[] | null> {
    if (!this.externalEmbeddingEndpoint) return null;

    const attemptFetch = async () => {
      const resp = await fetch(this.externalEmbeddingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.externalEmbeddingApiKey ? { Authorization: `Bearer ${this.externalEmbeddingApiKey}` } : {}),
        },
        body: JSON.stringify({
          audio_base64: audioBuffer.toString('base64'),
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`status ${resp.status} body: ${text}`);
      }
      const data = (await resp.json()) as { embedding?: number[] };
      if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
        throw new Error('missing embedding');
      }
      return data.embedding;
    };

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const embedding = await attemptFetch();
        this.externalEmbeddingHealthy = true;
        this.lastExternalSuccess = Date.now();
        return embedding;
      } catch (error) {
        logger.warn('External speaker embedding attempt failed', { attempt, error });
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        } else {
          this.externalEmbeddingHealthy = false;
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Normalize embedding length to targetDims via repeat/truncate and L2 normalize.
   */
  private normalizeEmbeddingDim(
    embedding: number[],
    targetDims = this.targetEmbeddingDim,
  ): number[] {
    if (embedding.length === 0) return new Array(targetDims).fill(0);
    const out = new Array(targetDims);
    for (let i = 0; i < targetDims; i++) {
      out[i] = embedding[i % embedding.length];
    }
    const mag = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
    return out.map((v) => v / mag);
  }

  /**
   * Extract voice features from audio buffer
   * Tries ONNX encoder first, then external service, then deterministic PCM-based embedding.
   */
  private async extractVoiceFeatures(audioBuffer: Buffer): Promise<VoiceprintFeatures> {
    const sampleRate = 16000; // assumed stream sample rate; conservative estimate for duration
    const duration = audioBuffer.length / (sampleRate * 2); // 16-bit samples

    // Preferred: ONNX speaker encoder (built-in)
    const onnxEmbedding = await this.runOnnxEmbedding(audioBuffer);
    if (onnxEmbedding) {
      return {
        embedding: onnxEmbedding,
        sampleDuration: duration,
        sampleQuality: duration >= this.MIN_ENROLLMENT_DURATION ? 1.0 : 0.5,
      };
    }

    // Secondary: external embedding endpoint
    const external = await this.fetchExternalEmbedding(audioBuffer);
    if (external) {
      const normalizedEmbedding = this.normalizeEmbeddingDim(external);
      return {
        embedding: normalizedEmbedding,
        sampleDuration: duration,
        sampleQuality: duration >= this.MIN_ENROLLMENT_DURATION ? 1.0 : 0.5,
      };
    }

    // Convert buffer to int16 samples
    const sampleCount = Math.floor(audioBuffer.length / 2);
    const samples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = audioBuffer.readInt16LE(i * 2);
    }

    // Frame-level RMS over 128 buckets
    const buckets = 128;
    const bucketSize = Math.max(1, Math.floor(sampleCount / buckets));
    const rmsBuckets: number[] = new Array(buckets).fill(0);
    for (let b = 0; b < buckets; b++) {
      let sumSquares = 0;
      let count = 0;
      const start = b * bucketSize;
      const end = Math.min(sampleCount, start + bucketSize);
      for (let i = start; i < end; i++) {
        const s = samples[i];
        sumSquares += s * s;
        count += 1;
      }
      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      rmsBuckets[b] = rms / 32768; // normalize to [0,1]
    }

    // Basic spectral proxy: zero-crossing rate and mean/std
    let zeroCrossings = 0;
    let prev = samples[0] || 0;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < sampleCount; i++) {
      const s = samples[i];
      sum += s;
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zeroCrossings += 1;
      prev = s;
    }
    const mean = sampleCount ? sum / sampleCount : 0;
    const std = sampleCount ? Math.sqrt(sumSq / sampleCount - mean * mean) : 0;
    const zcr = sampleCount ? zeroCrossings / sampleCount : 0;

    const baseVector = [...rmsBuckets, zcr, mean / 32768, std / 32768];

    // Expand to target dims by deterministic tiling with slight variation
    const embeddingValues: number[] = [];
    while (embeddingValues.length < this.targetEmbeddingDim) {
      for (let i = 0; i < baseVector.length && embeddingValues.length < this.targetEmbeddingDim; i++) {
        const v = baseVector[i];
        // apply small deterministic modulation to avoid repetition artifacts
        const mod = Math.sin((embeddingValues.length + 1) * 0.017) * 0.05;
        embeddingValues.push(Math.max(-1, Math.min(1, v + mod)));
      }
    }

    // Normalize vector
    const magnitude =
      Math.sqrt(embeddingValues.reduce((sum, v) => sum + v * v, 0)) || 1;
    const embedding = embeddingValues.map((v) => v / magnitude);

    const energyMean = rmsBuckets.reduce((a, b) => a + b, 0) / rmsBuckets.length || 0;
    const sampleQuality =
      duration >= this.MIN_ENROLLMENT_DURATION && energyMean > 0.01 ? 1.0 : 0.5;

    return {
      embedding,
      sampleDuration: duration,
      sampleQuality,
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
      const embeddingLength = features[0]?.embedding.length || this.targetEmbeddingDim;
      const averagedEmbedding = new Array(embeddingLength).fill(0);
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
      const finalEmbedding = this.normalizeEmbeddingDim(normalizedEmbedding);

      // Store voiceprint in database using raw SQL with pgvector
      // Prisma doesn't support vector type directly, so we use raw SQL
      const embeddingString = `[${finalEmbedding.join(',')}]`;
      
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "Voiceprint" (id, "userId", embedding, "enrolledAt", "updatedAt", "isActive", confidence)
          VALUES (
            gen_random_uuid()::text,
            ${userId}::text,
            ${embeddingString}::vector,
            NOW(),
            NOW(),
            true,
            ${this.MIN_CONFIDENCE_THRESHOLD}
          )
          ON CONFLICT ("userId")
          DO UPDATE SET
            embedding = EXCLUDED.embedding,
            "updatedAt" = NOW(),
            "isActive" = true,
            confidence = EXCLUDED.confidence
        `,
      );

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
      const voiceprint = await this.prisma.$queryRaw<Array<{
        embedding: string;
        confidence: number;
        isActive: boolean;
      }>>(
        Prisma.sql`
          SELECT embedding::text as embedding, confidence, "isActive"
          FROM "Voiceprint"
          WHERE "userId" = ${userId}::text AND "isActive" = true
          LIMIT 1
        `,
      );

      if (!voiceprint || voiceprint.length === 0) {
        return {
          verified: false,
          confidence: 0,
          message: 'Voiceprint not enrolled. Please enroll your voice first.',
        };
      }

      const storedEmbedding = this.normalizeEmbeddingDim(
        JSON.parse(voiceprint[0].embedding) as number[],
      );
      const threshold = voiceprint[0].confidence;

      // Extract features from incoming audio
      const features = await this.extractVoiceFeatures(audioBuffer);
      const normalizedIncoming = this.normalizeEmbeddingDim(features.embedding);

      // Calculate similarity
      const similarity = this.cosineSimilarity(
        normalizedIncoming,
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

  getEncoderHealth(): {
    provider: string;
    onnxHealthy: boolean;
    externalHealthy: boolean;
    lastExternalSuccess: number | null;
    targetEmbeddingDim: number;
  } {
    return {
      provider: this.speakerEncoderProvider,
      onnxHealthy: this.onnxHealthy,
      externalHealthy: this.externalEmbeddingHealthy,
      lastExternalSuccess: this.lastExternalSuccess,
      targetEmbeddingDim: this.targetEmbeddingDim,
    };
  }

  getTargetEmbeddingDim(): number {
    return this.targetEmbeddingDim;
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
      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "Voiceprint"
          SET "isActive" = false, "updatedAt" = NOW()
          WHERE "userId" = ${userId}::text
        `,
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
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*) as count
          FROM "Voiceprint"
          WHERE "userId" = ${userId}::text AND "isActive" = true
        `,
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
