import OpenAI from 'openai';
import { UncertaintyService } from '../uncertainty/uncertaintyService';
import logger from '../../utils/logger';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;
type RTuningDataset = Awaited<
  ReturnType<typeof globalPrisma.rTuningDataset.findFirstOrThrow>
>;

export interface ValidationResult {
  id?: string;
  question: string;
  category: string;
  passed: boolean;
  score: number;
  reasons: string[];
}

export interface ValidationReport {
  total: number;
  passed: number;
  failed: number;
  averageScore: number;
  duplicates: string[];
  results: ValidationResult[];
}

/**
 * DatasetValidator checks unanswerability, category alignment, and duplicate diversity.
 */
export class DatasetValidator {
  private readonly prisma: PrismaClient;
  private readonly openai: OpenAI;
  private readonly uncertainty: UncertaintyService;
  private readonly duplicateThreshold = 0.9; // cosine similarity threshold

  constructor(
    prismaClient?: PrismaClient,
    openaiClient?: OpenAI,
    uncertaintyService?: UncertaintyService,
  ) {
    this.prisma = prismaClient || globalPrisma;
    this.openai =
      openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.uncertainty =
      uncertaintyService || new UncertaintyService(this.prisma);
  }

  /**
   * Validate an entire dataset and persist validation results.
   */
  async validateDataset(items: RTuningDataset[]): Promise<ValidationReport> {
    const results: ValidationResult[] = [];
    const embeddings: number[][] = [];
    const duplicates: string[] = [];

    for (const item of items) {
      const result = await this.validateQuestion(item);
      results.push(result);

      // Duplicate detection
      const embedding = await this.embed(item.question);
      for (const existing of embeddings) {
        if (
          this.cosineSimilarity(existing, embedding) > this.duplicateThreshold
        ) {
          duplicates.push(item.id);
          result.passed = false;
          result.reasons.push('duplicate_detected');
          break;
        }
      }
      embeddings.push(embedding);

      // Persist validation flags
      await this.prisma.rTuningDataset.update({
        where: { id: item.id },
        data: {
          isValidated: result.passed,
          validationScore: result.score,
          metadata: {
            ...item.metadata,
            validationReasons: result.reasons,
          },
        },
      });
    }

    const passed = results.filter((r) => r.passed).length;
    const averageScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      averageScore,
      duplicates,
      results,
    };
  }

  /**
   * Validate a single question.
   */
  async validateQuestion(item: RTuningDataset): Promise<ValidationResult> {
    const reasons: string[] = [];

    const unanswerable = await this.checkUnanswerability(item.question);
    if (!unanswerable) {
      reasons.push('answerable_detected');
    }

    const categoryValid = await this.checkCategory(
      item.question,
      item.category,
    );
    if (!categoryValid) {
      reasons.push('category_mismatch');
    }

    const refusalValid = this.checkRefusalText(item.expectedResponse);
    if (!refusalValid) {
      reasons.push('refusal_invalid');
    }

    const passed = reasons.length === 0;
    const score = Math.max(
      0,
      1 -
        reasons.length * 0.25 -
        (unanswerable ? 0 : 0.25) -
        (categoryValid ? 0 : 0.25) -
        (refusalValid ? 0 : 0.25),
    );

    return {
      id: item.id,
      question: item.question,
      category: item.category,
      passed,
      score,
      reasons,
    };
  }

  /**
   * Use uncertainty evaluation to confirm the model should abstain.
   */
  async checkUnanswerability(question: string): Promise<boolean> {
    try {
      const result = await this.uncertainty.evaluateUncertainty(question);
      // If the model would abstain, consider it unanswerable
      return result.shouldAbstain || result.confidence < 0.4;
    } catch (error) {
      logger.warn('Unanswerability check failed', { error });
      return false;
    }
  }

  /**
   * Light category verification using LLM classification.
   */
  async checkCategory(question: string, category: string): Promise<boolean> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Classify the user question into one of: future_event, fake_entity, out_of_scope, impossible, ambiguous. Respond with only the label.',
          },
          { role: 'user', content: question },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      const label = completion.choices[0]?.message?.content
        ?.trim()
        .toLowerCase();
      return label === category.toLowerCase();
    } catch (error) {
      logger.warn('Category check failed', { error });
      return false;
    }
  }

  private checkRefusalText(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      normalized.includes("i don't know") ||
      normalized.includes('cannot answer') ||
      normalized.includes('cannot help')
    );
  }

  /**
   * Detect duplicates in a dataset via cosine similarity.
   */
  async detectDuplicates(items: RTuningDataset[]): Promise<string[]> {
    const duplicates: string[] = [];
    const embeddings: number[][] = [];

    for (const item of items) {
      const emb = await this.embed(item.question);
      for (const existing of embeddings) {
        if (this.cosineSimilarity(existing, emb) > this.duplicateThreshold) {
          duplicates.push(item.id);
          break;
        }
      }
      embeddings.push(emb);
    }

    return duplicates;
  }

  private async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }
}
