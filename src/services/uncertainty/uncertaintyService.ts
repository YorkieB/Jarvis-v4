/**
 * Unified Uncertainty Service
 *
 * Integrates Semantic Entropy and Conformal Prediction to provide
 * comprehensive uncertainty quantification for LLM responses.
 */

import OpenAI from 'openai';
import { SemanticEntropyCalculator } from './semanticEntropy';
import { ConformalPrediction } from './conformalPrediction';
import logger from '../../utils/logger';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;

export interface UncertaintyResult {
  shouldAbstain: boolean;
  confidence: number;
  semanticEntropy: number;
  conformalScore: number;
  reason: string;
  metadata?: {
    clusterCount?: number;
    quantile?: number;
  };
}

export class UncertaintyService {
  private readonly semanticEntropy: SemanticEntropyCalculator;
  private readonly conformalPrediction: ConformalPrediction;
  private readonly openai: OpenAI;
  private readonly sampleCount: number;
  private readonly sampleTemperature: number;

  constructor(
    prisma: PrismaClient,
    sampleCount: number = 10,
    sampleTemperature: number = 0.6,
  ) {
    this.semanticEntropy = new SemanticEntropyCalculator();
    this.conformalPrediction = new ConformalPrediction(prisma);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.sampleCount = sampleCount;
    this.sampleTemperature = sampleTemperature;
  }

  /**
   * Evaluate uncertainty for a query-response pair
   *
   * This method:
   * 1. Generates multiple candidate responses (for semantic entropy)
   * 2. Calculates semantic entropy over clusters
   * 3. Uses semantic entropy as non-conformity score for conformal prediction
   * 4. Returns unified uncertainty result
   *
   * @param query - User query
   * @param response - Generated response (optional, will generate if not provided)
   * @param model - OpenAI model to use (default: gpt-4)
   * @returns Uncertainty evaluation result
   */
  async evaluateUncertainty(
    query: string,
    response?: string,
    model: string = 'gpt-4',
  ): Promise<UncertaintyResult> {
    try {
      // Generate multiple candidate responses for semantic entropy
      const candidates = await this.generateCandidateResponses(query, model);

      // Calculate semantic entropy
      const entropyResult = await this.semanticEntropy.calculate(
        query,
        candidates,
      );

      // Use semantic entropy as non-conformity score
      const conformalResult = await this.conformalPrediction.evaluate(
        query,
        response || candidates[0],
        entropyResult.entropy,
      );

      // Combine results
      const shouldAbstain = conformalResult.shouldAbstain;
      const confidence = conformalResult.confidence;

      // If high semantic entropy (many diverse clusters), lower confidence
      const adjustedConfidence = Math.min(
        confidence,
        1 - entropyResult.entropy / Math.log2(entropyResult.clusterCount || 1),
      );

      const reason =
        conformalResult.reason +
        (entropyResult.clusterCount > 1
          ? `; Semantic entropy: ${entropyResult.entropy.toFixed(3)} (${entropyResult.clusterCount} clusters)`
          : '; Low semantic entropy (all responses cluster together)');

      logger.info('Uncertainty evaluation completed', {
        query: query.substring(0, 50),
        shouldAbstain,
        confidence: adjustedConfidence,
        semanticEntropy: entropyResult.entropy,
        clusterCount: entropyResult.clusterCount,
      });

      return {
        shouldAbstain,
        confidence: Math.max(0, adjustedConfidence),
        semanticEntropy: entropyResult.entropy,
        conformalScore: conformalResult.score,
        reason,
        metadata: {
          clusterCount: entropyResult.clusterCount,
          quantile: conformalResult.quantile,
        },
      };
    } catch (error) {
      logger.error('Uncertainty evaluation failed', { error, query });
      // Fail-safe: abstain on error
      return {
        shouldAbstain: true,
        confidence: 0,
        semanticEntropy: 0,
        conformalScore: 0,
        reason: `Uncertainty evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate multiple candidate responses for semantic entropy calculation
   */
  private async generateCandidateResponses(
    query: string,
    model: string,
  ): Promise<string[]> {
    const candidates: string[] = [];

    // Generate N candidate responses with moderate temperature for diversity
    const promises = Array.from({ length: this.sampleCount }, () =>
      this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful AI assistant. Provide accurate and concise answers.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: this.sampleTemperature,
        max_tokens: 500,
      }),
    );

    const responses = await Promise.all(promises);

    for (const response of responses) {
      const content = response.choices[0]?.message?.content;
      if (content) {
        candidates.push(content);
      }
    }

    return candidates;
  }

  /**
   * Add calibration entry (for building calibration set)
   */
  async addCalibrationEntry(
    query: string,
    response: string,
    semanticEntropy: number,
    groundTruth?: string,
  ): Promise<void> {
    await this.conformalPrediction.addCalibrationEntry(
      query,
      response,
      semanticEntropy,
      groundTruth,
    );
  }

  /**
   * Get calibration statistics
   */
  async getCalibrationStats() {
    return this.conformalPrediction.getCalibrationStats();
  }
}
