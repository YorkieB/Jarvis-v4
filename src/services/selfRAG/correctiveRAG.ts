import OpenAI from 'openai';
import logger from '../../utils/logger';

export interface CorrectiveResult<TDoc> {
  rewrittenQuery: string | null;
  expandedQuery: string | null;
  attempts: number;
  docs: TDoc[];
  abstain: boolean;
}

export type RetrievalFn<TDoc> = (query: string) => Promise<TDoc[]>;

interface CorrectiveOptions {
  model?: string;
  maxAttempts?: number;
  enableWebExpansion?: boolean;
  expansionPrompt?: string;
}

/**
 * CorrectiveRAG rewrites queries and expands retrieval when REL is low.
 */
export class CorrectiveRAG<TDoc = { content: string }> {
  private openai: OpenAI;
  private model: string;
  private maxAttempts: number;
  private enableWebExpansion: boolean;
  private expansionPrompt: string;

  constructor(openaiClient?: OpenAI, options: CorrectiveOptions = {}) {
    this.openai =
      openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = options.model || process.env.SELF_RAG_MODEL || 'gpt-4o-mini';
    this.maxAttempts =
      options.maxAttempts ??
      Number(process.env.SELF_RAG_CORRECTIVE_MAX_ATTEMPTS || 2);
    this.enableWebExpansion =
      options.enableWebExpansion ??
      (process.env.SELF_RAG_ENABLE_WEB_EXPANSION || 'false') === 'true';
    this.expansionPrompt =
      options.expansionPrompt ||
      'Broaden the query to include related terms or broader scope to improve recall.';
  }

  async attempt(
    query: string,
    retrievalFn: RetrievalFn<TDoc>,
  ): Promise<CorrectiveResult<TDoc>> {
    let attempts = 0;
    let currentQuery = query;
    let docs: TDoc[] = [];
    let expandedQuery: string | null = null;
    let rewrittenQuery: string | null = null;

    while (attempts < this.maxAttempts) {
      attempts += 1;
      rewrittenQuery = (await this.rewriteQuery(currentQuery)) || currentQuery;
      const nextQuery = rewrittenQuery;
      docs = await retrievalFn(nextQuery);

      if (docs.length > 0) {
        return {
          rewrittenQuery,
          expandedQuery,
          attempts,
          docs,
          abstain: false,
        };
      }

      // Optional expansion step
      if (this.enableWebExpansion) {
        expandedQuery = await this.expandQuery(currentQuery);
        if (expandedQuery) {
          const expandedDocs = await retrievalFn(expandedQuery);
          if (expandedDocs.length > 0) {
            return {
              rewrittenQuery,
              expandedQuery,
              attempts,
              docs: expandedDocs,
              abstain: false,
            };
          }
          docs = expandedDocs;
        }
      }

      currentQuery = nextQuery;
    }

    return {
      rewrittenQuery,
      expandedQuery,
      attempts,
      docs: [],
      abstain: true,
    };
  }

  private async rewriteQuery(query: string): Promise<string | null> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the query to improve retrieval recall. Respond with the rewritten query only.',
          },
          { role: 'user', content: query },
        ],
      });
      const rewritten = completion.choices[0]?.message?.content?.trim();
      return rewritten && rewritten.length > 0 ? rewritten : null;
    } catch (error) {
      logger.warn('CorrectiveRAG rewrite failed', { error });
      return null;
    }
  }

  private async expandQuery(query: string): Promise<string | null> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.4,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content: `${this.expansionPrompt} Respond with a single expanded query.`,
          },
          { role: 'user', content: query },
        ],
      });
      const expanded = completion.choices[0]?.message?.content?.trim();
      return expanded && expanded.length > 0 ? expanded : null;
    } catch (error) {
      logger.warn('CorrectiveRAG expand failed', { error });
      return null;
    }
  }
}
