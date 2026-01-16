/**
 * Code Verification Service
 * Verifies fixes through tests, type checking, and linting
 */

import logger from '../utils/logger';
import { TestRunner, TestResult } from '../utils/testRunner';
import { TypeChecker, TypeCheckResult } from '../utils/typeChecker';
import { CodeAnalysisService } from './codeAnalysisService';
import { ErrorType } from './errorDetectionService';

export interface VerificationResult {
  success: boolean;
  testsPassed?: boolean;
  typeCheckPassed?: boolean;
  lintingPassed?: boolean;
  error?: string;
  details?: {
    testResult?: TestResult;
    typeCheckResult?: TypeCheckResult;
    lintingIssues?: number;
  };
}

export class CodeVerificationService {
  private testRunner: TestRunner;
  private typeChecker: TypeChecker;
  private codeAnalysis: CodeAnalysisService;

  constructor(projectRoot?: string) {
    this.testRunner = new TestRunner(projectRoot);
    this.typeChecker = new TypeChecker(projectRoot);
    this.codeAnalysis = new CodeAnalysisService();
  }

  /**
   * Verify a fix for a specific error
   */
  async verifyFix(
    filePath: string,
    errorType: ErrorType,
  ): Promise<VerificationResult> {
    try {
      const results: VerificationResult = {
        success: true,
        details: {},
      };

      // Type checking (for type and syntax errors)
      if (errorType === 'type' || errorType === 'syntax') {
        const typeCheck = await this.typeChecker.checkFile(filePath);
        results.typeCheckPassed = typeCheck.success;
        results.details!.typeCheckResult = typeCheck;

        if (!typeCheck.success) {
          results.success = false;
          results.error = `Type check failed: ${typeCheck.errors[0]?.message || 'Unknown error'}`;
          return results;
        }
      }

      // Linting (for linting errors)
      if (errorType === 'linting') {
        const analysis = await this.codeAnalysis.analyzeFile(filePath);
        const lintingErrors = analysis.issues.filter(
          (i) => i.type === 'linting' && i.severity === 'error',
        );
        results.lintingPassed = lintingErrors.length === 0;
        results.details!.lintingIssues = lintingErrors.length;

        if (lintingErrors.length > 0) {
          results.success = false;
          results.error = `Linting failed: ${lintingErrors[0].message}`;
          return results;
        }
      }

      // Test execution (for logic errors and general verification)
      if (errorType === 'logic' || errorType === 'runtime') {
        const testResult = await this.testRunner.runTestsForFile(filePath);
        results.testsPassed = testResult.success;
        results.details!.testResult = testResult;

        if (!testResult.success) {
          results.success = false;
          results.error = `Tests failed: ${testResult.errors[0] || 'Unknown error'}`;
          return results;
        }
      }

      // For syntax errors, also run type check
      if (errorType === 'syntax') {
        const typeCheck = await this.typeChecker.checkFile(filePath);
        results.typeCheckPassed = typeCheck.success;
        results.details!.typeCheckResult = typeCheck;

        if (!typeCheck.success) {
          results.success = false;
          results.error = `Type check failed after syntax fix: ${typeCheck.errors[0]?.message || 'Unknown error'}`;
          return results;
        }
      }

      logger.info('Fix verification passed', { filePath, errorType });
      return results;
    } catch (error) {
      logger.error('Fix verification failed', { error, filePath, errorType });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify fix with full project check
   */
  async verifyFixFullProject(filePath: string): Promise<VerificationResult> {
    try {
      // Run type check on entire project
      const typeCheck = await this.typeChecker.checkProject();
      if (!typeCheck.success) {
        return {
          success: false,
          typeCheckPassed: false,
          error: `Project type check failed: ${typeCheck.errors[0]?.message || 'Unknown error'}`,
          details: {
            typeCheckResult: typeCheck,
          },
        };
      }

      // Run all tests
      const testResult = await this.testRunner.runAllTests();
      if (!testResult.success) {
        return {
          success: false,
          testsPassed: false,
          error: `Tests failed: ${testResult.errors[0] || 'Unknown error'}`,
          details: {
            testResult,
          },
        };
      }

      return {
        success: true,
        testsPassed: true,
        typeCheckPassed: true,
        details: {
          testResult,
          typeCheckResult: typeCheck,
        },
      };
    } catch (error) {
      logger.error('Full project verification failed', { error, filePath });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
