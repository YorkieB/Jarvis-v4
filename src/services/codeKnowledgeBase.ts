/**
 * Code Knowledge Base
 * Stores and retrieves code fix patterns and solutions
 */

import type { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { DetectedError } from './errorDetectionService';
import { FixCandidate } from './llmCodeFixer';
import { prisma as globalPrisma } from '../utils/prisma';

export interface SimilarFix {
  fix: string;
  confidence: number;
  errorType: string;
  errorMessage: string;
}

export class CodeKnowledgeBase {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || globalPrisma;
  }

  /**
   * Store a successful fix
   */
  async storeFix(
    error: DetectedError,
    fix: FixCandidate,
    verified: boolean = true,
  ): Promise<string> {
    try {
      const codeFix = await this.prisma.codeFix.create({
        data: {
          errorType: error.type,
          errorMessage: error.message,
          filePath: error.filePath,
          lineNumber: error.lineNumber || null,
          codeSnippet: error.codeSnippet || '',
          fixApplied: fix.fix,
          fixStatus: verified ? 'success' : 'pending',
          verified,
          appliedAt: verified ? new Date() : null,
        },
      });

      logger.info('Fix stored in knowledge base', {
        fixId: codeFix.id,
        errorType: error.type,
      });

      return codeFix.id;
    } catch (error) {
      logger.error('Failed to store fix', { error });
      throw error;
    }
  }

  /**
   * Find similar fixes for an error
   */
  async findSimilarFixes(
    error: DetectedError,
    limit: number = 5,
  ): Promise<SimilarFix[]> {
    try {
      // Search for similar errors by type and message pattern
      const fixes = await this.prisma.codeFix.findMany({
        where: {
          errorType: error.type,
          fixStatus: 'success',
          verified: true,
          OR: [
            {
              errorMessage: {
                contains: this.extractKeyWords(error.message),
              },
            },
            {
              codeSnippet: {
                contains: error.codeSnippet?.substring(0, 50) || '',
              },
            },
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      return fixes.map((fix) => ({
        fix: fix.fixApplied,
        confidence: this.calculateSimilarity(error, fix),
        errorType: fix.errorType,
        errorMessage: fix.errorMessage,
      }));
    } catch (error) {
      logger.error('Failed to find similar fixes', { error });
      return [];
    }
  }

  /**
   * Calculate similarity between error and stored fix
   */
  private calculateSimilarity(
    error: DetectedError,
    storedFix: {
      errorMessage: string;
      codeSnippet: string;
      filePath: string;
    },
  ): number {
    let similarity = 0;

    // Message similarity (50% weight)
    const messageSimilarity = this.stringSimilarity(
      error.message,
      storedFix.errorMessage,
    );
    similarity += messageSimilarity * 0.5;

    // Code snippet similarity (30% weight)
    if (error.codeSnippet && storedFix.codeSnippet) {
      const codeSimilarity = this.stringSimilarity(
        error.codeSnippet,
        storedFix.codeSnippet,
      );
      similarity += codeSimilarity * 0.3;
    }

    // File path similarity (20% weight)
    if (error.filePath && storedFix.filePath) {
      const pathSimilarity = this.stringSimilarity(
        error.filePath,
        storedFix.filePath,
      );
      similarity += pathSimilarity * 0.2;
    }

    return Math.min(1, similarity);
  }

  /**
   * Simple string similarity (Levenshtein distance normalized)
   */
  private stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    // Check if shorter string is substring of longer
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Simple word overlap
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    const commonWords = words1.filter((w) => words2.includes(w));
    const totalWords = new Set([...words1, ...words2]).size;

    return commonWords.length / totalWords;
  }

  /**
   * Extract key words from error message
   */
  private extractKeyWords(message: string): string {
    // Extract important words (skip common words)
    const commonWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'error', 'failed'];
    const words = message
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !commonWords.includes(w))
      .slice(0, 5);

    return words.join(' ');
  }

  /**
   * Get fix statistics
   */
  async getFixStats() {
    try {
      const total = await this.prisma.codeFix.count();
      const successful = await this.prisma.codeFix.count({
        where: { fixStatus: 'success', verified: true },
      });
      const failed = await this.prisma.codeFix.count({
        where: { fixStatus: 'failed' },
      });

      const byType = await this.prisma.codeFix.groupBy({
        by: ['errorType'],
        _count: true,
      });

      return {
        total,
        successful,
        failed,
        successRate: total > 0 ? successful / total : 0,
        byType: byType.reduce(
          (acc, item) => ({ ...acc, [item.errorType]: item._count }),
          {} as Record<string, number>,
        ),
      };
    } catch (error) {
      logger.error('Failed to get fix stats', { error });
      return {
        total: 0,
        successful: 0,
        failed: 0,
        successRate: 0,
        byType: {},
      };
    }
  }
}
