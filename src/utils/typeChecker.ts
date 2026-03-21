/**
 * Type Checker Utilities
 * TypeScript type checking wrapper
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TypeCheckResult {
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
  }>;
  output: string;
}

export class TypeChecker {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Check types for a specific file
   */
  async checkFile(filePath: string): Promise<TypeCheckResult> {
    try {
      const { stdout, stderr } = await execAsync(
        `npx tsc --noEmit ${filePath}`,
        {
          cwd: this.projectRoot,
          timeout: 30000, // 30 second timeout
        },
      );

      const output = stdout + stderr;
      const errors = this.parseTypeErrors(output);

      return {
        success: errors.length === 0,
        errors,
        output,
      };
    } catch (error) {
      const output = this.combineCommandOutput(error);
      const errors = this.parseTypeErrors(output);

      return {
        success: false,
        errors,
        output,
      };
    }
  }

  /**
   * Check types for entire project
   */
  async checkProject(): Promise<TypeCheckResult> {
    try {
      const { stdout, stderr } = await execAsync('npm run type-check', {
        cwd: this.projectRoot,
        timeout: 60000, // 60 second timeout
      });

      const output = stdout + stderr;
      const errors = this.parseTypeErrors(output);

      return {
        success: errors.length === 0,
        errors,
        output,
      };
    } catch (error) {
      const output = this.combineCommandOutput(error);
      const errors = this.parseTypeErrors(output);

      return {
        success: false,
        errors,
        output,
      };
    }
  }

  /**
   * Parse TypeScript compiler errors from output
   */
  private parseTypeErrors(output: string): Array<{
    file: string;
    line: number;
    column: number;
    message: string;
  }> {
    const errors: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
    }> = [];

    // TypeScript error format: file(line,col): error TS####: message
    const errorRegex = /(.+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/g;
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[4].trim(),
      });
    }

    return errors;
  }

  private combineCommandOutput(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      ('stdout' in error || 'stderr' in error)
    ) {
      const stdout = this.normalizeOutput((error as { stdout?: unknown }).stdout);
      const stderr = this.normalizeOutput((error as { stderr?: unknown }).stderr);
      return `${stdout}${stderr}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return '';
  }

  private normalizeOutput(stream: unknown): string {
    if (typeof stream === 'string') {
      return stream;
    }
    if (Buffer.isBuffer(stream)) {
      return stream.toString();
    }
    return '';
  }
}
