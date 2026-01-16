/**
 * Test Runner Utilities
 * Wrapper for Jest test execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import logger from './logger';

const execAsync = promisify(exec);

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  errors: string[];
  output: string;
}

export class TestRunner {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Run tests for a specific file
   */
  async runTestsForFile(filePath: string): Promise<TestResult> {
    try {
      // Find corresponding test file
      const testFile = this.findTestFile(filePath);
      if (!testFile) {
        return {
          success: true,
          passed: 0,
          failed: 0,
          errors: [],
          output: 'No test file found',
        };
      }

      return await this.runTestFile(testFile);
    } catch (error) {
      logger.error('Failed to run tests for file', { error, filePath });
      return {
        success: false,
        passed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        output: '',
      };
    }
  }

  /**
   * Run a specific test file
   */
  async runTestFile(testFilePath: string): Promise<TestResult> {
    try {
      const { stdout, stderr } = await execAsync(
        `npm test -- ${testFilePath}`,
        {
          cwd: this.projectRoot,
          timeout: 30000, // 30 second timeout
        },
      );

      const output = stdout + stderr;
      const passed = this.extractPassedCount(output);
      const failed = this.extractFailedCount(output);
      const errors = this.extractErrors(output);

      return {
        success: failed === 0,
        passed,
        failed,
        errors,
        output,
      };
    } catch (error: any) {
      const output = error.stdout || '' + error.stderr || '';
      const failed = this.extractFailedCount(output);
      const errors = this.extractErrors(output);

      return {
        success: false,
        passed: 0,
        failed,
        errors,
        output,
      };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestResult> {
    try {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: this.projectRoot,
        timeout: 60000, // 60 second timeout
      });

      const output = stdout + stderr;
      const passed = this.extractPassedCount(output);
      const failed = this.extractFailedCount(output);
      const errors = this.extractErrors(output);

      return {
        success: failed === 0,
        passed,
        failed,
        errors,
        output,
      };
    } catch (error: any) {
      const output = error.stdout || '' + error.stderr || '';
      const failed = this.extractFailedCount(output);
      const errors = this.extractErrors(output);

      return {
        success: false,
        passed: 0,
        failed,
        errors,
        output,
      };
    }
  }

  /**
   * Find test file for a source file
   */
  private findTestFile(filePath: string): string | null {
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    // Common test file patterns
    const testPatterns = [
      `${baseName}.test${ext}`,
      `${baseName}.spec${ext}`,
      `${baseName}.test${ext}`,
      `${baseName}spec${ext}`,
    ];

    for (const pattern of testPatterns) {
      const testPath = path.join(dir, pattern);
      if (this.fileExists(testPath)) {
        return testPath;
      }

      // Also check in __tests__ directory
      const testDirPath = path.join(dir, '__tests__', pattern);
      if (this.fileExists(testDirPath)) {
        return testDirPath;
      }
    }

    return null;
  }

  /**
   * Check if file exists
   */
  private fileExists(filePath: string): boolean {
    try {
      const fs = require('fs');
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Extract passed test count from output
   */
  private extractPassedCount(output: string): number {
    const match = output.match(/(\d+) passing/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract failed test count from output
   */
  private extractFailedCount(output: string): number {
    const match = output.match(/(\d+) failing/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract errors from test output
   */
  private extractErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('FAIL') || lines[i].includes('Error:')) {
        // Extract error message (next few lines)
        const errorLines: string[] = [];
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          errorLines.push(lines[j]);
        }
        errors.push(errorLines.join('\n'));
      }
    }

    return errors;
  }
}
