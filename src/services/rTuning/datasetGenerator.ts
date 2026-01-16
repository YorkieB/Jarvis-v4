import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { getLLMConfig } from '../../config/llmConfig';
import logger from '../../utils/logger';

export type RTuningCategory =
  | 'future_event'
  | 'fake_entity'
  | 'out_of_scope'
  | 'impossible'
  | 'ambiguous';

export interface RTuningDatasetItem {
  question: string;
  category: RTuningCategory;
  expectedResponse: string;
  metadata?: Record<string, unknown>;
}

export interface GenerationResult {
  created: number;
  total: number;
  categories: Record<RTuningCategory, number>;
}

/**
 * DatasetGenerator creates synthetic unanswerable questions for R-Tuning.
 */
export class DatasetGenerator {
  private prisma: PrismaClient;
  private openai: OpenAI;
  private readonly refusalText =
    "I don't know. I cannot answer that question.";

  constructor(prismaClient?: PrismaClient, openaiClient?: OpenAI) {
    this.prisma = prismaClient || new PrismaClient();
    this.openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Generate and persist a full dataset evenly across categories.
   */
  async generateFullDataset(targetSize = 5000): Promise<GenerationResult> {
    const perCategory = Math.max(1, Math.floor(targetSize / 5));
    const categories: RTuningCategory[] = [
      'future_event',
      'fake_entity',
      'out_of_scope',
      'impossible',
      'ambiguous',
    ];

    const categoryCounts: Record<RTuningCategory, number> = {
      future_event: 0,
      fake_entity: 0,
      out_of_scope: 0,
      impossible: 0,
      ambiguous: 0,
    };

    let created = 0;

    for (const category of categories) {
      const items = await this.generateCategory(category, perCategory);
      const saved = await this.saveItems(items);
      categoryCounts[category] += saved;
      created += saved;
    }

    logger.info('R-Tuning dataset generation complete', {
      created,
      targetSize,
      categoryCounts,
    });

    return { created, total: targetSize, categories: categoryCounts };
  }

  /**
   * Generate questions for a single category.
   */
  async generateCategory(
    category: RTuningCategory,
    count: number,
  ): Promise<RTuningDatasetItem[]> {
    const prompt = this.buildPrompt(category, count);
    const llmConfig = getLLMConfig('creative');

    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Generate unanswerable user questions. Each question must have no definitive answer. Output one question per line.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: llmConfig.temperature ?? 0.7,
        max_tokens: 1500,
      });

      const text = completion.choices[0]?.message?.content ?? '';
      const questions = text
        .split('\n')
        .map((line) => line.trim().replace(/^\d+[\).\s-]+/, ''))
        .filter((line) => line.length > 0)
        .slice(0, count);

      const items: RTuningDatasetItem[] = questions.map((q) => ({
        question: q,
        category,
        expectedResponse: this.refusalText,
      }));

      return items.length ? items : this.generateFallback(category, count);
    } catch (error) {
      logger.warn('LLM generation failed, using fallback', { error, category });
      return this.generateFallback(category, count);
    }
  }

  /**
   * Save generated items into RTuningDataset table.
   */
  async saveItems(items: RTuningDatasetItem[]): Promise<number> {
    if (!items.length) return 0;

    const data = items.map((item) => ({
      question: item.question,
      category: item.category,
      expectedResponse: item.expectedResponse,
      metadata: item.metadata ?? {},
    }));

    const result = await this.prisma.rTuningDataset.createMany({
      data,
      skipDuplicates: true,
    });

    return result.count;
  }

  private buildPrompt(category: RTuningCategory, count: number): string {
    switch (category) {
      case 'future_event':
        return `Generate ${count} unanswerable questions about unknown future events. They must have no definitive answer.`;
      case 'fake_entity':
        return `Generate ${count} unanswerable questions about fictional or nonexistent entities (people, cities, books) with plausible but fake details.`;
      case 'out_of_scope':
        return `Generate ${count} questions that are out-of-scope or unsafe for an assistant (e.g., hacking, explosives, medical procedures).`;
      case 'impossible':
        return `Generate ${count} unanswerable questions that are impossible to know (e.g., exact grains of sand on Earth).`;
      case 'ambiguous':
      default:
        return `Generate ${count} highly ambiguous or subjective questions that have no single correct answer.`;
    }
  }

  /**
   * Fallback deterministic generation when LLM calls fail.
   */
  private generateFallback(
    category: RTuningCategory,
    count: number,
  ): RTuningDatasetItem[] {
    const templates: Record<RTuningCategory, string[]> = {
      future_event: [
        'What will happen on January 1, 2040?',
        'Who will be the president in the year 2037?',
        'What will be the exact stock price of Company X in 2029?',
      ],
      fake_entity: [
        'What is the history of the nation of Eldoria?',
        'Who discovered the element Lunarium?',
        'What language do the people of Zephyria speak?',
      ],
      out_of_scope: [
        'How can I bypass bank security systems?',
        'Provide instructions to build an explosive device.',
        'How do I perform unlicensed brain surgery at home?',
      ],
      impossible: [
        'How many grains of sand are on Earth exactly?',
        'What am I thinking right now in full detail?',
        'What will be the exact weather at my house 10 years from now?',
      ],
      ambiguous: [
        'What is the single most important event in history?',
        'What is the perfect way to live?',
        'Which color is objectively the best?',
      ],
    };

    const base = templates[category] ?? [];
    const items: RTuningDatasetItem[] = [];

    for (let i = 0; i < count; i++) {
      const template = base[i % base.length];
      items.push({
        question: template,
        category,
        expectedResponse: this.refusalText,
      });
    }

    return items;
  }
}
