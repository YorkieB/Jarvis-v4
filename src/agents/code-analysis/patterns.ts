/**
 * Error Pattern Recognition
 * Common error patterns and their fixes
 */

export interface ErrorPattern {
  type: 'syntax' | 'type' | 'runtime' | 'logic' | 'linting';
  pattern: RegExp;
  description: string;
  commonFix?: string;
  confidence: number;
}

export const COMMON_ERROR_PATTERNS: ErrorPattern[] = [
  // Syntax errors
  {
    type: 'syntax',
    pattern: /Unexpected token/,
    description: 'Syntax error: unexpected token',
    confidence: 0.9,
  },
  {
    type: 'syntax',
    pattern: /Missing.*bracket|Missing.*parenthesis/,
    description: 'Missing bracket or parenthesis',
    commonFix: 'Add missing bracket/parenthesis',
    confidence: 0.95,
  },
  {
    type: 'syntax',
    pattern: /Unexpected end of file/,
    description: 'Unexpected end of file',
    confidence: 0.9,
  },

  // Type errors
  {
    type: 'type',
    pattern: /Type.*is not assignable to type/,
    description: 'Type mismatch error',
    confidence: 0.85,
  },
  {
    type: 'type',
    pattern: /Property.*does not exist on type/,
    description: 'Property does not exist',
    commonFix: 'Add missing property or fix property name',
    confidence: 0.9,
  },
  {
    type: 'type',
    pattern: /Cannot find name/,
    description: 'Undefined variable or import',
    commonFix: 'Add import or define variable',
    confidence: 0.85,
  },

  // Runtime errors
  {
    type: 'runtime',
    pattern: /Cannot read property.*of undefined/,
    description: 'Null/undefined access',
    commonFix: 'Add null check or optional chaining',
    confidence: 0.9,
  },
  {
    type: 'runtime',
    pattern: /is not a function/,
    description: 'Calling non-function as function',
    confidence: 0.85,
  },
  {
    type: 'runtime',
    pattern: /Cannot read property.*of null/,
    description: 'Null access',
    commonFix: 'Add null check',
    confidence: 0.9,
  },

  // Logic errors
  {
    type: 'logic',
    pattern: /Test.*failed|Assertion.*failed/,
    description: 'Test failure',
    confidence: 0.8,
  },
  {
    type: 'logic',
    pattern: /Expected.*but got/,
    description: 'Value mismatch',
    confidence: 0.85,
  },

  // Linting errors
  {
    type: 'linting',
    pattern: /is defined but never used/,
    description: 'Unused variable',
    commonFix: 'Remove unused variable or use it',
    confidence: 0.95,
  },
  {
    type: 'linting',
    pattern: /Unexpected console\./,
    description: 'Console statement in code',
    commonFix: 'Remove console statement or use logger',
    confidence: 0.9,
  },
];

/**
 * Match error message to pattern
 */
export function matchErrorPattern(
  errorMessage: string,
): ErrorPattern | null {
  for (const pattern of COMMON_ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Get fix suggestion for pattern
 */
export function getFixSuggestion(pattern: ErrorPattern): string | null {
  return pattern.commonFix || null;
}
