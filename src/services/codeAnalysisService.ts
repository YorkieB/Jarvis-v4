/**
 * Code Analysis Service
 * Static analysis and code quality checks
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { parseCode, extractCodeSnippet, getLanguage } from '../utils/codeParser';

export interface CodeIssue {
  type: 'syntax' | 'type' | 'linting' | 'logic' | 'runtime';
  severity: 'error' | 'warning' | 'info';
  message: string;
  filePath: string;
  lineNumber: number;
  columnNumber?: number;
  codeSnippet?: string;
}

export interface AnalysisResult {
  filePath: string;
  issues: CodeIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

export class CodeAnalysisService {
  /**
   * Analyze a file for code issues
   */
  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          filePath,
          issues: [
            {
              type: 'runtime',
              severity: 'error',
              message: 'File not found',
              filePath,
              lineNumber: 0,
            },
          ],
          hasErrors: true,
          hasWarnings: false,
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const language = getLanguage(filePath);

      const issues: CodeIssue[] = [];

      // Parse code for syntax errors
      const parseResult = await parseCode(content, filePath);
      if (!parseResult.success) {
        for (const error of parseResult.errors) {
          issues.push({
            type: 'syntax',
            severity: 'error',
            message: error.message,
            filePath,
            lineNumber: error.line,
            columnNumber: error.column,
          });
        }
      }

      // Basic linting checks (can be enhanced with ESLint)
      issues.push(...this.checkBasicLinting(content, filePath));

      return {
        filePath,
        issues,
        hasErrors: issues.some((i) => i.severity === 'error'),
        hasWarnings: issues.some((i) => i.severity === 'warning'),
      };
    } catch (error) {
      logger.error('Failed to analyze file', { error, filePath });
      return {
        filePath,
        issues: [
          {
            type: 'runtime',
            severity: 'error',
            message:
              error instanceof Error ? error.message : 'Unknown analysis error',
            filePath,
            lineNumber: 0,
          },
        ],
        hasErrors: true,
        hasWarnings: false,
      };
    }
  }

  /**
   * Analyze multiple files
   */
  async analyzeFiles(filePaths: string[]): Promise<AnalysisResult[]> {
    const results = await Promise.all(
      filePaths.map((filePath) => this.analyzeFile(filePath)),
    );
    return results;
  }

  /**
   * Analyze codebase directory
   */
  async analyzeDirectory(
    directory: string,
    extensions: string[] = ['.ts', '.tsx', '.js', '.jsx'],
  ): Promise<AnalysisResult[]> {
    const files: string[] = [];

    function walkDir(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, dist, .git
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    walkDir(directory);
    return this.analyzeFiles(files);
  }

  /**
   * Basic linting checks
   */
  private checkBasicLinting(
    content: string,
    filePath: string,
  ): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Check for console.log (warning)
      if (line.includes('console.log')) {
        issues.push({
          type: 'linting',
          severity: 'warning',
          message: 'console.log should be removed in production',
          filePath,
          lineNumber,
          codeSnippet: line.trim(),
        });
      }

      // Check for TODO comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        issues.push({
          type: 'linting',
          severity: 'info',
          message: 'TODO/FIXME comment found',
          filePath,
          lineNumber,
          codeSnippet: line.trim(),
        });
      }

      // Check line length (warning if > 120 chars)
      if (line.length > 120) {
        issues.push({
          type: 'linting',
          severity: 'warning',
          message: `Line exceeds 120 characters (${line.length})`,
          filePath,
          lineNumber,
        });
      }
    });

    return issues;
  }

  /**
   * Extract error context from stack trace
   */
  extractErrorContext(error: Error): CodeIssue[] {
    const issues: CodeIssue[] = [];

    if (!error.stack) {
      return issues;
    }

    const stackLines = error.stack.split('\n');
    for (const line of stackLines) {
      // Match stack trace format: "at functionName (file:line:column)"
      const match = line.match(/at .+ \((.+):(\d+):(\d+)\)/);
      if (match) {
        const [, filePath, lineStr, colStr] = match;
        const lineNumber = parseInt(lineStr, 10);
        const columnNumber = parseInt(colStr, 10);

        const snippet = extractCodeSnippet(filePath, lineNumber);
        issues.push({
          type: 'runtime',
          severity: 'error',
          message: error.message,
          filePath,
          lineNumber,
          columnNumber,
          codeSnippet: snippet?.code,
        });
      }
    }

    return issues;
  }
}
