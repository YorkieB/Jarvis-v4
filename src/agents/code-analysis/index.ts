/**
 * Code Analysis Agent
 * Proactively scans codebase for errors and triggers auto-fix
 */

import { BaseAgent } from '../base-agent';
import type { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';
import { ErrorDetectionService } from '../../services/errorDetectionService';
import { AutoFixService } from '../../services/autoFixService';
import { CodeAnalysisService } from '../../services/codeAnalysisService';
import { CodeKnowledgeBase } from '../../services/codeKnowledgeBase';
import { matchErrorPattern } from './patterns';
import { LspValidatorAdapter } from './lspValidator';
import { prisma as globalPrisma } from '../../utils/prisma';

export class CodeAnalysisAgent extends BaseAgent {
  protected agentType = 'code-analysis';
  protected permissions = ['read:code', 'write:code', 'read:errors'];

  private prisma: PrismaClient;
  private errorDetection: ErrorDetectionService;
  private autoFix: AutoFixService;
  private codeAnalysis: CodeAnalysisService;
  private knowledgeBase: CodeKnowledgeBase;
  private scanningInterval: NodeJS.Timeout | null = null;
  private readonly scanInterval = 300000; // 5 minutes
  private readonly srcDirectory = 'src';
  private lspValidator: LspValidatorAdapter;

  constructor(prisma?: PrismaClient) {
    super();
    this.prisma = prisma || globalPrisma;
    this.errorDetection = new ErrorDetectionService();
    this.knowledgeBase = new CodeKnowledgeBase(this.prisma);
    this.autoFix = new AutoFixService(
      this.errorDetection,
      undefined,
      undefined,
      undefined,
      this.knowledgeBase,
    );
    this.codeAnalysis = new CodeAnalysisService();
    this.lspValidator = new LspValidatorAdapter();
  }

  /**
   * Start periodic codebase scanning
   */
  startScanning(intervalMs?: number): void {
    if (this.scanningInterval) {
      logger.warn('Code scanning already started');
      return;
    }

    const interval = intervalMs || this.scanInterval;
    this.scanningInterval = setInterval(() => {
      void this.scanCodebase();
    }, interval);

    logger.info('Code analysis agent started scanning', { interval });
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (this.scanningInterval) {
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
      logger.info('Code analysis agent stopped scanning');
    }
  }

  /**
   * Scan codebase for errors
   */
  async scanCodebase(): Promise<void> {
    try {
      logger.info('Starting codebase scan');

      // Analyze all TypeScript files
      const results = await this.codeAnalysis.analyzeDirectory(
        this.srcDirectory,
      );

      // Detect errors from analysis results
      for (const result of results) {
        if (result.hasErrors) {
          for (const issue of result.issues) {
            if (issue.severity === 'error') {
              // Detect error
              const error = await this.errorDetection.detectRuntimeError(
                new Error(issue.message),
                undefined,
              );

              // Check if auto-fixable
              const pattern = matchErrorPattern(issue.message);
              if (pattern && !this.errorDetection.isExternalError(error)) {
                logger.info('Auto-fixable error detected', {
                  errorId: error.id,
                  type: error.type,
                  filePath: error.filePath,
                });

                // Attempt auto-fix
                const fixResult = await this.autoFix.autoFix(error, {
                  autoApply: true,
                  verifyAfterFix: true,
                  rollbackOnFailure: true,
                });

                if (fixResult.success && fixResult.fixApplied) {
                  logger.info('Error auto-fixed', {
                    errorId: error.id,
                    filePath: error.filePath,
                  });
                } else {
                  logger.warn('Auto-fix failed', {
                    errorId: error.id,
                    error: fixResult.error,
                  });
                }
              }
            }
          }
        }
      }

      logger.info('Codebase scan completed');
    } catch (error) {
      logger.error('Codebase scan failed', { error });
    }
  }

  /**
   * Analyze specific file on demand
   */
  async analyzeFile(filePath: string): Promise<void> {
    try {
      const result = await this.codeAnalysis.analyzeFile(filePath);
      if (result.hasErrors) {
        logger.warn('Errors found in file', {
          filePath,
          errorCount: result.issues.filter((i) => i.severity === 'error')
            .length,
        });
      }

      // LSP validation on-demand for this file content (if provided by service)
      if (result?.content) {
        const validation = await this.lspValidator.validateWithGenerator(
          async () => result.content as string,
        );
        if (!validation.clean) {
          logger.warn('LSP blocking diagnostics for file', {
            filePath,
            errors: validation.diagnostics.errors,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to analyze file', { error, filePath });
    }
  }

  /**
   * Get code health metrics
   */
  async getCodeHealthMetrics() {
    try {
      const stats = await this.knowledgeBase.getFixStats();
      const allErrors = this.errorDetection.getAllErrors();

      return {
        totalErrors: allErrors.length,
        fixStats: stats,
        recentErrors: allErrors.slice(-10),
      };
    } catch (error) {
      logger.error('Failed to get code health metrics', { error });
      return {
        totalErrors: 0,
        fixStats: {
          total: 0,
          successful: 0,
          failed: 0,
          successRate: 0,
          byType: {},
        },
        recentErrors: [],
      };
    }
  }
}
