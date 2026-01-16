import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

export interface ReflectionScores {
  RET: number;
  REL: number;
  SUP: number;
  USE: number;
}

export interface ReflectionResult {
  scores: ReflectionScores;
  pass: {
    RET: boolean;
    REL: boolean;
    SUP: boolean;
    USE: boolean;
  };
  metadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}

interface ReflectionGraderOptions {
  relThreshold?: number;
  supThreshold?: number;
  useThreshold?: number;
  model?: string;
}

/**
 * ReflectionGrader scores RET/REL/SUP/USE via a lightweight LLM (defaults to gpt-4o-mini).
 */
export class ReflectionGrader {
  private prisma: PrismaClient;
  private openai: OpenAI;
  private relThreshold: number;
  private supThreshold: number;
  private useThreshold: number;
  private model: string;

  constructor(
    prismaClient?: PrismaClient,
    openaiClient?: OpenAI,
    options: ReflectionGraderOptions = {},
  ) {
    this.prisma = prismaClient || new PrismaClient();
    this.openai =
      openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.relThreshold =
      options.relThreshold ??
      Number(process.env.SELF_RAG_REL_THRESHOLD || 0.5);
    this.supThreshold =
      options.supThreshold ??
      Number(process.env.SELF_RAG_SUP_THRESHOLD || 0.7);
    this.useThreshold =
      options.useThreshold ??
      Number(process.env.SELF_RAG_USE_THRESHOLD || 0.8);
    this.model = options.model || process.env.SELF_RAG_MODEL || 'gpt-4o-mini';
  }

  /**
   * Score reflection tokens. Stores ReflectionScore rows if queryId is provided.
   */
  async score(params: {
    query: string;
    retrievedDocs?: Array<{ id?: string; content: string; metadata?: unknown }>;
    response?: string;
    queryId?: string;
  }): Promise<ReflectionResult> {
    const prompt = this.buildPrompt(params.query, params.retrievedDocs, params.response);
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'Score the question/response with four values (0.0-1.0): RET (need retrieval), REL (doc relevance), SUP (support by evidence), USE (answer completeness). Output JSON only: {"RET":0.x,"REL":0.x,"SUP":0.x,"USE":0.x}',
          },
          { role: 'user', content: prompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = this.parseScores(raw);

      const result: ReflectionResult = {
        scores: parsed,
        pass: {
          RET: parsed.RET >= 0.5, // heuristic need
          REL: parsed.REL >= this.relThreshold,
          SUP: parsed.SUP >= this.supThreshold,
          USE: parsed.USE >= this.useThreshold,
        },
        metadata: {
          model: this.model,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
        },
      };

      if (params.queryId) {
        await this.persistScores(params.queryId, parsed);
      }

      return result;
    } catch (error) {
      logger.warn('ReflectionGrader scoring failed, defaulting to zeros', {
        error,
      });
      const zero: ReflectionScores = { RET: 0, REL: 0, SUP: 0, USE: 0 };
      return {
        scores: zero,
        pass: { RET: false, REL: false, SUP: false, USE: false },
      };
    }
  }

  private buildPrompt(
    query: string,
    docs?: Array<{ id?: string; content: string }>,
    response?: string,
  ): string {
    const docsText =
      docs && docs.length
        ? docs
            .map(
              (d, idx) => `Doc ${idx + 1}${d.id ? ` (${d.id})` : ''}: ${d.content}`,
            )
            .join('\n')
        : 'No documents retrieved.';

    return [
      `Question: ${query}`,
      `Documents:\n${docsText}`,
      response ? `Proposed Answer: ${response}` : 'No answer yet.',
      'Return JSON only with keys RET, REL, SUP, USE.',
    ].join('\n');
  }

  private parseScores(raw: string): ReflectionScores {
    try {
      const json = JSON.parse(raw);
      const clamp = (v: any) =>
        Math.max(0, Math.min(1, typeof v === 'number' ? v : parseFloat(v)));
      return {
        RET: clamp(json.RET ?? 0),
        REL: clamp(json.REL ?? 0),
        SUP: clamp(json.SUP ?? 0),
        USE: clamp(json.USE ?? 0),
      };
    } catch {
      return { RET: 0, REL: 0, SUP: 0, USE: 0 };
    }
  }

  private async persistScores(queryId: string, scores: ReflectionScores) {
    const entries = [
      { tokenType: 'RET', score: scores.RET, threshold: 0.5, passed: scores.RET >= 0.5 },
      { tokenType: 'REL', score: scores.REL, threshold: this.relThreshold, passed: scores.REL >= this.relThreshold },
      { tokenType: 'SUP', score: scores.SUP, threshold: this.supThreshold, passed: scores.SUP >= this.supThreshold },
      { tokenType: 'USE', score: scores.USE, threshold: this.useThreshold, passed: scores.USE >= this.useThreshold },
    ];

    for (const entry of entries) {
      try {
        await this.prisma.reflectionScore.create({
          data: {
            queryId,
            tokenType: entry.tokenType,
            score: entry.score,
            threshold: entry.threshold,
            passed: entry.passed,
          },
        });
      } catch (error) {
        logger.warn('Failed to persist reflection score', {
          queryId,
          tokenType: entry.tokenType,
          error,
        });
      }
    }
  }
}
