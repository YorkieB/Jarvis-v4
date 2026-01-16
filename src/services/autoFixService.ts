/**
 * Auto-Fix Service
 * Orchestrates error detection, fix generation, and application
 */

import logger from '../utils/logger';
import { ErrorDetectionService, DetectedError } from './errorDetectionService';
import { LLMCodeFixer, FixCandidate } from './llmCodeFixer';
import { CodePatcher } from './codePatcher';
import { CodeVerificationService } from './codeVerificationService';
import { CodeKnowledgeBase } from './codeKnowledgeBase';

export interface AutoFixResult {
  success: boolean;
  errorId: string;
  fixApplied?: boolean;
  fixCandidate?: FixCandidate;
  verificationPassed?: boolean;
  rolledBack?: boolean;
  error?: string;
}

export interface AutoFixOptions {
  confidenceThreshold?: number;
  autoApply?: boolean;
  verifyAfterFix?: boolean;
  rollbackOnFailure?: boolean;
}

export class AutoFixService {
  private errorDetection: ErrorDetectionService;
  private llmFixer: LLMCodeFixer;
  private codePatcher: CodePatcher;
  private verification: CodeVerificationService;
  private knowledgeBase: CodeKnowledgeBase;
  private readonly defaultOptions: Required<AutoFixOptions> = {
    confidenceThreshold: parseFloat(
      process.env.CODE_FIX_CONFIDENCE_THRESHOLD || '0.8',
    ),
    autoApply: process.env.CODE_AUTO_FIX_ENABLED !== 'false',
    verifyAfterFix: true,
    rollbackOnFailure: true,
  };

  constructor(
    errorDetection?: ErrorDetectionService,
    llmFixer?: LLMCodeFixer,
    codePatcher?: CodePatcher,
    verification?: CodeVerificationService,
    knowledgeBase?: CodeKnowledgeBase,
  ) {
    this.errorDetection = errorDetection || new ErrorDetectionService();
    this.llmFixer = llmFixer || new LLMCodeFixer();
    this.codePatcher = codePatcher || new CodePatcher();
    this.verification = verification || new CodeVerificationService();
    this.knowledgeBase = knowledgeBase || new CodeKnowledgeBase();
  }

  /**
   * Auto-fix an error
   */
  async autoFix(
    error: DetectedError,
    options: AutoFixOptions = {},
  ): Promise<AutoFixResult> {
    const opts = { ...this.defaultOptions, ...options };

    // Skip external errors
    if (this.errorDetection.isExternalError(error)) {
      return {
        success: false,
        errorId: error.id,
        error: 'External error - cannot auto-fix',
      };
    }

    try {
      // Check knowledge base for similar fixes
      const similarFixes = await this.knowledgeBase.findSimilarFixes(error);
      if (similarFixes.length > 0) {
        logger.info('Found similar fix in knowledge base', {
          errorId: error.id,
          similarCount: similarFixes.length,
        });
        // Use knowledge base fix if confidence is high
        const bestFix = similarFixes[0];
        if (bestFix.confidence >= opts.confidenceThreshold) {
          return await this.applyKnownFix(error, bestFix, opts);
        }
      }

      // Generate fixes using LLM
      const fixResult = await this.llmFixer.generateFixes(error);
      if (!fixResult.success || fixResult.candidates.length === 0) {
        return {
          success: false,
          errorId: error.id,
          error: fixResult.error || 'No fix candidates generated',
        };
      }

      // Select best fix candidate
      const bestCandidate = this.selectBestFix(fixResult.candidates, opts);
      if (!bestCandidate) {
        return {
          success: false,
          errorId: error.id,
          error: 'No fix candidate meets confidence threshold',
        };
      }

      // Apply fix if auto-apply is enabled
      if (opts.autoApply) {
        return await this.applyAndVerifyFix(error, bestCandidate, opts);
      } else {
        return {
          success: true,
          errorId: error.id,
          fixApplied: false,
          fixCandidate: bestCandidate,
        };
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unknown error';
      logger.error('Auto-fix failed', {
        error: caughtError,
        errorId: error.id,
      });
      return {
        success: false,
        errorId: error.id,
        error: message,
      };
    }
  }

  /**
   * Apply a known fix from knowledge base
   */
  private async applyKnownFix(
    error: DetectedError,
    knownFix: { fix: string; confidence: number },
    options: Required<AutoFixOptions>,
  ): Promise<AutoFixResult> {
    const fixCandidate: FixCandidate = {
      fix: knownFix.fix,
      explanation: 'Fix from knowledge base',
      confidence: knownFix.confidence,
      riskLevel: 'low',
    };

    return await this.applyAndVerifyFix(error, fixCandidate, options);
  }

  /**
   * Select best fix candidate
   */
  private selectBestFix(
    candidates: FixCandidate[],
    options: Required<AutoFixOptions>,
  ): FixCandidate | null {
    // Filter by confidence threshold
    const qualified = candidates.filter(
      (c) => c.confidence >= options.confidenceThreshold,
    );

    if (qualified.length === 0) {
      return null;
    }

    // Prefer low-risk fixes
    const lowRisk = qualified.filter((c) => c.riskLevel === 'low');
    if (lowRisk.length > 0) {
      return lowRisk[0];
    }

    // Otherwise, return highest confidence
    return qualified[0];
  }

  /**
   * Apply fix and verify
   */
  private async applyAndVerifyFix(
    error: DetectedError,
    candidate: FixCandidate,
    options: Required<AutoFixOptions>,
  ): Promise<AutoFixResult> {
    if (!error.filePath || !error.lineNumber) {
      return {
        success: false,
        errorId: error.id,
        error: 'Missing file path or line number',
      };
    }

    // Apply fix
    const patchResult = await this.codePatcher.applyFix(
      error.filePath,
      error.lineNumber,
      error.codeSnippet || '',
      candidate.fix,
    );

    if (!patchResult.success) {
      return {
        success: false,
        errorId: error.id,
        error: patchResult.error,
      };
    }

    // Verify fix if enabled
    if (options.verifyAfterFix) {
      const verification = await this.verification.verifyFix(
        error.filePath,
        error.type,
      );

      if (!verification.success) {
        // Rollback if verification fails
        if (options.rollbackOnFailure && patchResult.backupPath) {
          await this.codePatcher.rollbackFix(
            patchResult.backupPath,
            error.filePath,
          );
        }

        return {
          success: false,
          errorId: error.id,
          fixApplied: true,
          fixCandidate: candidate,
          verificationPassed: false,
          rolledBack: options.rollbackOnFailure,
          error: verification.error,
        };
      }

      // Store successful fix in knowledge base
      await this.knowledgeBase.storeFix(error, candidate, true);

      return {
        success: true,
        errorId: error.id,
        fixApplied: true,
        fixCandidate: candidate,
        verificationPassed: true,
      };
    }

    return {
      success: true,
      errorId: error.id,
      fixApplied: true,
      fixCandidate: candidate,
    };
  }

  /**
   * Auto-fix all detected errors
   */
  async autoFixAll(options: AutoFixOptions = {}): Promise<AutoFixResult[]> {
    const errors = this.errorDetection.getAllErrors();
    const results = await Promise.all(
      errors.map((error) => this.autoFix(error, options)),
    );
    return results;
  }
}
