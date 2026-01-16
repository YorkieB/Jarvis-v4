/**
 * Code Parser Utilities
 * AST parsing and code structure analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

export interface CodeLocation {
  filePath: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface CodeSnippet {
  code: string;
  location: CodeLocation;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface ParseResult {
  success: boolean;
  ast?: unknown;
  errors: Array<{
    message: string;
    line: number;
    column?: number;
  }>;
}

/**
 * Parse TypeScript/JavaScript code
 * Uses TypeScript compiler API for parsing
 */
export async function parseCode(
  code: string,
  filePath?: string,
): Promise<ParseResult> {
  try {
    // For now, basic validation
    // In production, use TypeScript compiler API or Babel parser
    const errors: Array<{ message: string; line: number; column?: number }> =
      [];

    // Basic syntax checks
    if (!code || code.trim().length === 0) {
      errors.push({
        message: 'Code is empty',
        line: 1,
      });
    }

    // Check for common syntax errors
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push({
        message: `Mismatched braces: ${openBraces} opening, ${closeBraces} closing`,
        line: 1,
      });
    }

    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push({
        message: `Mismatched parentheses: ${openParens} opening, ${closeParens} closing`,
        line: 1,
      });
    }

    return {
      success: errors.length === 0,
      errors,
    };
  } catch (error) {
    logger.error('Failed to parse code', { error, filePath });
    return {
      success: false,
      errors: [
        {
          message:
            error instanceof Error ? error.message : 'Unknown parse error',
          line: 1,
        },
      ],
    };
  }
}

/**
 * Extract code snippet around a specific location
 */
export function extractCodeSnippet(
  filePath: string,
  lineNumber: number,
  contextLines: number = 5,
): CodeSnippet | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length) {
      return null;
    }

    const startLine = Math.max(1, lineNumber - contextLines);
    const endLine = Math.min(lines.length, lineNumber + contextLines);

    const snippet = lines.slice(startLine - 1, endLine).join('\n');
    const targetLine = lines[lineNumber - 1];

    return {
      code: targetLine,
      location: {
        filePath,
        lineNumber,
      },
      context: {
        before: lines.slice(startLine - 1, lineNumber - 1),
        after: lines.slice(lineNumber, endLine),
      },
    };
  } catch (error) {
    logger.error('Failed to extract code snippet', { error, filePath, lineNumber });
    return null;
  }
}

/**
 * Get file extension to determine language
 */
export function getLanguage(filePath: string): 'typescript' | 'javascript' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') {
    return 'typescript';
  }
  if (ext === '.js' || ext === '.jsx') {
    return 'javascript';
  }
  return 'unknown';
}
