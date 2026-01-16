/**
 * Conformal Prediction Implementation
 * 
 * Provides statistical guarantees on error rates using conformal prediction.
 * Maintains a calibration set and computes empirical quantiles for abstention decisions.
 */

import logger from '../../utils/logger';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;

export interface CalibrationEntry {
  query: string;
  response: string;
  groundTruth?: string;
  score: number;
}

export interface ConformalPredictionResult {
  shouldAbstain: boolean;
  confidence: number;
  quantile: number;
  score: number;
  reason: string;
}

export class ConformalPrediction {
  private readonly prisma: PrismaClient;
  private readonly alpha: number; // Error rate (e.g., 0.01 for 99% reliability)
  private quantile: number | null = null; // Cached quantile from calibration set
  private readonly minCalibrationSize: number;

  constructor(
    prisma: PrismaClient,
    alpha: number = 0.01,
    minCalibrationSize: number = 1000,
  ) {
    this.prisma = prisma;
    this.alpha = alpha;
    this.minCalibrationSize = minCalibrationSize;
  }

  /**
   * Add entry to calibration set
   */
  async addCalibrationEntry(
    query: string,
    response: string,
    score: number,
    groundTruth?: string,
  ): Promise<void> {
    try {
      await this.prisma.conformalCalibration.create({
        data: {
          query,
          response,
          groundTruth,
          score,
        },
      });

      // Invalidate cached quantile
      this.quantile = null;
    } catch (error) {
      logger.error('Failed to add calibration entry', { error });
      throw error;
    }
  }

  /**
   * Compute empirical quantile from calibration set
   * Formula: q̂ = sortedScores[⌈(N+1)(1-α)⌉]
   */
  async computeQuantile(): Promise<number> {
    if (this.quantile !== null) {
      return this.quantile;
    }

    try {
      const entries = await this.prisma.conformalCalibration.findMany({
        orderBy: { score: 'asc' },
        select: { score: true },
      });

      if (entries.length < this.minCalibrationSize) {
        logger.warn(
          `Calibration set too small: ${entries.length} < ${this.minCalibrationSize}. Using default quantile.`,
        );
        // Use a conservative default quantile (high threshold = more abstentions)
        this.quantile = 0.9;
        return this.quantile;
      }

      const scores = entries.map((entry: { score: number }) => entry.score);
      const n = scores.length;
      const index = Math.ceil((n + 1) * (1 - this.alpha));

      // Clamp index to valid range
      const clampedIndex = Math.min(index, n - 1);
      this.quantile = scores[clampedIndex];

      logger.info('Conformal prediction quantile computed', {
        quantile: this.quantile,
        calibrationSize: n,
        alpha: this.alpha,
        index: clampedIndex,
      });

      return this.quantile ?? 0.9;
    } catch (error) {
      logger.error('Failed to compute quantile', { error });
      // Fallback to conservative default
      this.quantile = 0.9;
      return this.quantile ?? 0.9;
    }
  }

  /**
   * Evaluate if a response should be abstained based on conformal prediction
   * 
   * @param query - User query
   * @param response - Generated response
   * @param nonConformityScore - Non-conformity score (e.g., semantic entropy or negative log-likelihood)
   * @returns Prediction result with abstention decision
   */
  async evaluate(
    query: string,
    response: string,
    nonConformityScore: number,
  ): Promise<ConformalPredictionResult> {
    const quantile = await this.computeQuantile();

    // If score exceeds quantile, abstain
    const shouldAbstain = nonConformityScore > quantile;

    // Confidence is inverse of score relative to quantile
    // Higher score = lower confidence
    const confidence = shouldAbstain
      ? Math.max(0, 1 - (nonConformityScore - quantile) / quantile)
      : Math.min(1, 1 - (nonConformityScore / quantile));

    const reason = shouldAbstain
      ? `Non-conformity score ${nonConformityScore.toFixed(3)} exceeds quantile ${quantile.toFixed(3)} (α=${this.alpha})`
      : `Non-conformity score ${nonConformityScore.toFixed(3)} within acceptable range (quantile=${quantile.toFixed(3)})`;

    logger.debug('Conformal prediction evaluation', {
      query: query.substring(0, 50),
      shouldAbstain,
      score: nonConformityScore,
      quantile,
      confidence,
    });

    return {
      shouldAbstain,
      confidence,
      quantile,
      score: nonConformityScore,
      reason,
    };
  }

  /**
   * Get calibration set statistics
   */
  async getCalibrationStats(): Promise<{
    size: number;
    minScore: number;
    maxScore: number;
    avgScore: number;
    quantile: number;
  }> {
    try {
      const entries = await this.prisma.conformalCalibration.findMany({
        select: { score: true },
      });

      if (entries.length === 0) {
        return {
          size: 0,
          minScore: 0,
          maxScore: 0,
          avgScore: 0,
          quantile: 0,
        };
      }

      const scores = entries.map((entry: { score: number }) => entry.score);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      const quantile = await this.computeQuantile();

      return {
        size: entries.length,
        minScore,
        maxScore,
        avgScore,
        quantile,
      };
    } catch (error) {
      logger.error('Failed to get calibration stats', { error });
      throw error;
    }
  }

  /**
   * Clear calibration set (for testing/reset)
   */
  async clearCalibrationSet(): Promise<void> {
    try {
      await this.prisma.conformalCalibration.deleteMany({});
      this.quantile = null;
      logger.info('Calibration set cleared');
    } catch (error) {
      logger.error('Failed to clear calibration set', { error });
      throw error;
    }
  }
}
