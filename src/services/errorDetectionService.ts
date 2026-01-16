/**
 * Error Detection Service
 * Detects and categorizes all types of coding errors
 */

import logger from '../utils/logger';
import { CodeAnalysisService, CodeIssue } from './codeAnalysisService';
import { extractCodeSnippet } from '../utils/codeParser';

export type ErrorType = 'syntax' | 'type' | 'runtime' | 'logic' | 'linting' | 'external';

export interface DetectedError {
  id: string;
  type: ErrorType;
  message: string;
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  codeSnippet?: string;
  stackTrace?: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

export class ErrorDetectionService {
  private codeAnalysis: CodeAnalysisService;
  private detectedErrors: Map<string, DetectedError> = new Map();

  constructor() {
    this.codeAnalysis = new CodeAnalysisService();
  }

  /**
   * Detect error from runtime exception
   */
  async detectRuntimeError(error: Error, stackTrace?: string): Promise<DetectedError> {
    const issues = this.codeAnalysis.extractErrorContext(error);

    // Extract file path and line from stack trace
    let filePath = 'unknown';
    let lineNumber: number | undefined;
    let columnNumber: number | undefined;

    if (stackTrace || error.stack) {
      const trace = stackTrace || error.stack || '';
      const match = trace.match(/at .+ \((.+):(\d+):(\d+)\)/);
      if (match) {
        [, filePath, lineStr, colStr] = match;
        lineNumber = parseInt(lineStr, 10);
        columnNumber = parseInt(colStr, 10);
      }
    }

    const codeSnippet =
      filePath !== 'unknown' && lineNumber
        ? extractCodeSnippet(filePath, lineNumber)?.code
        : undefined;

    const detectedError: DetectedError = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'runtime',
      message: error.message,
      filePath,
      lineNumber,
      columnNumber,
      codeSnippet,
      stackTrace: stackTrace || error.stack,
      timestamp: new Date(),
      context: {
        name: error.name,
      },
    };

    this.detectedErrors.set(detectedError.id, detectedError);
    logger.info('Runtime error detected', { errorId: detectedError.id, filePath, lineNumber });

    return detectedError;
  }

  /**
   * Detect syntax errors from code analysis
   */
  async detectSyntaxErrors(filePath: string): Promise<DetectedError[]> {
    const analysis = await this.codeAnalysis.analyzeFile(filePath);
    const errors: DetectedError[] = [];

    for (const issue of analysis.issues) {
      if (issue.type === 'syntax' && issue.severity === 'error') {
        const detectedError: DetectedError = {
          id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'syntax',
          message: issue.message,
          filePath: issue.filePath,
          lineNumber: issue.lineNumber,
          columnNumber: issue.columnNumber,
          codeSnippet: issue.codeSnippet,
          timestamp: new Date(),
        };

        errors.push(detectedError);
        this.detectedErrors.set(detectedError.id, detectedError);
      }
    }

    return errors;
  }

  /**
   * Detect type errors
   */
  async detectTypeErrors(filePath: string): Promise<DetectedError[]> {
    // Placeholder - would use TypeScript compiler API
    const analysis = await this.codeAnalysis.analyzeFile(filePath);
    const errors: DetectedError[] = [];

    for (const issue of analysis.issues) {
      if (issue.type === 'type' && issue.severity === 'error') {
        const detectedError: DetectedError = {
          id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'type',
          message: issue.message,
          filePath: issue.filePath,
          lineNumber: issue.lineNumber,
          columnNumber: issue.columnNumber,
          codeSnippet: issue.codeSnippet,
          timestamp: new Date(),
        };

        errors.push(detectedError);
        this.detectedErrors.set(detectedError.id, detectedError);
      }
    }

    return errors;
  }

  /**
   * Detect linting errors
   */
  async detectLintingErrors(filePath: string): Promise<DetectedError[]> {
    const analysis = await this.codeAnalysis.analyzeFile(filePath);
    const errors: DetectedError[] = [];

    for (const issue of analysis.issues) {
      if (issue.type === 'linting') {
        const detectedError: DetectedError = {
          id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'linting',
          message: issue.message,
          filePath: issue.filePath,
          lineNumber: issue.lineNumber,
          columnNumber: issue.columnNumber,
          codeSnippet: issue.codeSnippet,
          timestamp: new Date(),
          context: {
            severity: issue.severity,
          },
        };

        errors.push(detectedError);
        this.detectedErrors.set(detectedError.id, detectedError);
      }
    }

    return errors;
  }

  /**
   * Detect logic errors from test failures
   */
  async detectLogicErrors(testResults: {
    passed: boolean;
    error?: string;
    filePath?: string;
  }): Promise<DetectedError | null> {
    if (testResults.passed) {
      return null;
    }

    const detectedError: DetectedError = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'logic',
      message: testResults.error || 'Test failed',
      filePath: testResults.filePath || 'unknown',
      timestamp: new Date(),
      context: {
        testFailure: true,
      },
    };

    this.detectedErrors.set(detectedError.id, detectedError);
    return detectedError;
  }

  /**
   * Check if error is external (not auto-fixable)
   */
  isExternalError(error: DetectedError): boolean {
    // External errors: network, database connection, API failures
    const externalPatterns = [
      /network/i,
      /connection/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /database/i,
      /api.*error/i,
    ];

    return externalPatterns.some((pattern) =>
      pattern.test(error.message + ' ' + (error.stackTrace || '')),
    );
  }

  /**
   * Get detected error by ID
   */
  getError(errorId: string): DetectedError | undefined {
    return this.detectedErrors.get(errorId);
  }

  /**
   * Get all detected errors
   */
  getAllErrors(): DetectedError[] {
    return Array.from(this.detectedErrors.values());
  }

  /**
   * Clear detected errors
   */
  clearErrors(): void {
    this.detectedErrors.clear();
  }
}
