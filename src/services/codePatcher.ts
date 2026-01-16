/**
 * Code Patcher
 * Safely applies code fixes to files
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { extractCodeSnippet } from '../utils/codeParser';

export interface PatchResult {
  success: boolean;
  backupPath?: string;
  error?: string;
  originalCode?: string;
  patchedCode?: string;
}

export class CodePatcher {
  private backupDir: string;

  constructor(backupDir: string = '.code-backups') {
    this.backupDir = backupDir;
    this.ensureBackupDir();
  }

  /**
   * Apply a fix to a file
   */
  async applyFix(
    filePath: string,
    lineNumber: number,
    originalCode: string,
    fixedCode: string,
  ): Promise<PatchResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      // Create backup
      const backupPath = await this.createBackup(filePath);
      if (!backupPath) {
        return {
          success: false,
          error: 'Failed to create backup',
        };
      }

      // Read original file
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const lines = originalContent.split('\n');

      if (lineNumber < 1 || lineNumber > lines.length) {
        return {
          success: false,
          error: `Invalid line number: ${lineNumber}`,
        };
      }

      // Replace the line
      const targetLine = lines[lineNumber - 1];
      if (targetLine.trim() !== originalCode.trim()) {
        logger.warn('Code mismatch', {
          filePath,
          lineNumber,
          expected: originalCode,
          actual: targetLine,
        });
        // Still try to apply fix
      }

      // Replace line with fixed code
      lines[lineNumber - 1] = fixedCode;

      // Write patched file
      const patchedContent = lines.join('\n');
      fs.writeFileSync(filePath, patchedContent, 'utf-8');

      logger.info('Fix applied', {
        filePath,
        lineNumber,
        backupPath,
      });

      return {
        success: true,
        backupPath,
        originalCode: targetLine,
        patchedCode: fixedCode,
      };
    } catch (error) {
      logger.error('Failed to apply fix', { error, filePath, lineNumber });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply fix to code snippet (multi-line)
   */
  async applyFixToSnippet(
    filePath: string,
    startLine: number,
    endLine: number,
    originalSnippet: string,
    fixedSnippet: string,
  ): Promise<PatchResult> {
    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      // Create backup
      const backupPath = await this.createBackup(filePath);
      if (!backupPath) {
        return {
          success: false,
          error: 'Failed to create backup',
        };
      }

      // Read original file
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const lines = originalContent.split('\n');

      if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        return {
          success: false,
          error: `Invalid line range: ${startLine}-${endLine}`,
        };
      }

      // Extract original snippet
      const originalLines = lines.slice(startLine - 1, endLine);
      const originalText = originalLines.join('\n');

      if (originalText.trim() !== originalSnippet.trim()) {
        logger.warn('Snippet mismatch', {
          filePath,
          startLine,
          endLine,
        });
      }

      // Replace snippet
      const fixedLines = fixedSnippet.split('\n');
      const newLines = [
        ...lines.slice(0, startLine - 1),
        ...fixedLines,
        ...lines.slice(endLine),
      ];

      // Write patched file
      const patchedContent = newLines.join('\n');
      fs.writeFileSync(filePath, patchedContent, 'utf-8');

      logger.info('Snippet fix applied', {
        filePath,
        startLine,
        endLine,
        backupPath,
      });

      return {
        success: true,
        backupPath,
        originalCode: originalText,
        patchedCode: fixedSnippet,
      };
    } catch (error) {
      logger.error('Failed to apply snippet fix', {
        error,
        filePath,
        startLine,
        endLine,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rollback a fix using backup
   */
  async rollbackFix(backupPath: string, targetPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        logger.error('Backup file not found', { backupPath });
        return false;
      }

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      fs.writeFileSync(targetPath, backupContent, 'utf-8');

      logger.info('Fix rolled back', { backupPath, targetPath });
      return true;
    } catch (error) {
      logger.error('Failed to rollback fix', { error, backupPath, targetPath });
      return false;
    }
  }

  /**
   * Create backup of file
   */
  private async createBackup(filePath: string): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const fileName = path.basename(filePath);
      const backupFileName = `${fileName}.backup.${timestamp}`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Ensure backup directory exists
      this.ensureBackupDir();

      // Copy file to backup
      fs.copyFileSync(filePath, backupPath);

      return backupPath;
    } catch (error) {
      logger.error('Failed to create backup', { error, filePath });
      return null;
    }
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
}
