/**
 * LLM Code Fixer
 * Uses OpenAI API to generate code fixes
 */

import OpenAI from 'openai';
import logger from '../utils/logger';
import { DetectedError } from './errorDetectionService';
import { extractCodeSnippet } from '../utils/codeParser';
import { getLLMConfig } from '../config/llmConfig';

export interface FixCandidate {
  fix: string;
  explanation: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface FixGenerationResult {
  success: boolean;
  candidates: FixCandidate[];
  error?: string;
}

export class LLMCodeFixer {
  private openai: OpenAI;
  private readonly model: string = 'gpt-4';

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate fix candidates for an error
   */
  async generateFixes(error: DetectedError): Promise<FixGenerationResult> {
    try {
      if (!error.codeSnippet && !error.filePath) {
        return {
          success: false,
          candidates: [],
          error: 'No code context available for fix generation',
        };
      }

      // Build prompt with error context
      const prompt = this.buildFixPrompt(error);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert TypeScript/JavaScript developer. Generate code fixes for errors. Provide fixes in JSON format with explanation and confidence score.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: getLLMConfig('reasoning').temperature, // Reasoning mode for code fixes
        max_tokens: getLLMConfig('reasoning').maxTokens || 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          candidates: [],
          error: 'No response from LLM',
        };
      }

      // Parse LLM response
      const candidates = this.parseFixResponse(content, error);

      logger.info('Generated fix candidates', {
        errorId: error.id,
        candidateCount: candidates.length,
      });

      return {
        success: true,
        candidates,
      };
    } catch (error) {
      logger.error('Failed to generate fixes', { error });
      return {
        success: false,
        candidates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build prompt for fix generation
   */
  private buildFixPrompt(error: DetectedError): string {
    let prompt = `Fix the following ${error.type} error:\n\n`;
    prompt += `Error: ${error.message}\n`;

    if (error.filePath) {
      prompt += `File: ${error.filePath}\n`;
    }

    if (error.lineNumber) {
      prompt += `Line: ${error.lineNumber}\n`;
    }

    if (error.codeSnippet) {
      prompt += `\nCode:\n\`\`\`typescript\n${error.codeSnippet}\n\`\`\`\n`;
    } else if (error.filePath && error.lineNumber) {
      const snippet = extractCodeSnippet(error.filePath, error.lineNumber);
      if (snippet) {
        prompt += `\nCode:\n\`\`\`typescript\n${snippet.code}\n\`\`\`\n`;
      }
    }

    if (error.stackTrace) {
      prompt += `\nStack Trace:\n${error.stackTrace.substring(0, 500)}\n`;
    }

    prompt +=
      '\nProvide 1-3 fix candidates in JSON format:\n' +
      '[\n' +
      '  {\n' +
      '    "fix": "the fixed code",\n' +
      '    "explanation": "why this fix works",\n' +
      '    "confidence": 0.0-1.0,\n' +
      '    "riskLevel": "low|medium|high"\n' +
      '  }\n' +
      ']';

    return prompt;
  }

  /**
   * Parse LLM response into fix candidates
   */
  private parseFixResponse(
    content: string,
    error: DetectedError,
  ): FixCandidate[] {
    const candidates: FixCandidate[] = [];

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          fix: string;
          explanation: string;
          confidence: number;
          riskLevel: string;
        }>;

        for (const item of parsed) {
          candidates.push({
            fix: item.fix,
            explanation: item.explanation,
            confidence: Math.max(0, Math.min(1, item.confidence || 0.5)),
            riskLevel: (item.riskLevel || 'medium') as 'low' | 'medium' | 'high',
          });
        }
      } else {
        // Fallback: treat entire response as single fix
        candidates.push({
          fix: content.trim(),
          explanation: 'LLM-generated fix',
          confidence: 0.6,
          riskLevel: 'medium',
        });
      }
    } catch (parseError) {
      logger.warn('Failed to parse LLM response', { parseError, content });
      // Fallback: create a single candidate from raw response
      candidates.push({
        fix: content.trim(),
        explanation: 'LLM-generated fix (parsing failed)',
        confidence: 0.5,
        riskLevel: 'high',
      });
    }

    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confidence - a.confidence);

    return candidates;
  }
}
