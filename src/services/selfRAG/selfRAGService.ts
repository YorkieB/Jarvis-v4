import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { ReflectionGrader, ReflectionResult } from './reflectionGrader';
import { CorrectiveRAG, RetrievalFn } from './correctiveRAG';
import { getLLMConfig } from '../../config/llmConfig';
import logger from '../../utils/logger';

export interface SelfRAGDocument {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
}

export interface SelfRAGOptions {
  maxRetries?: number;
  model?: string;
  temperature?: number;
  relThreshold?: number;
  supThreshold?: number;
  useThreshold?: number;
}

export interface SelfRAGResult {
  response: string | null;
  abstain: boolean;
  reflection?: ReflectionResult;
  docsUsed?: SelfRAGDocument[];
  metadata?: Record<string, unknown>;
}

/**
 * SelfRAGService orchestrates assess → retrieve → filter → draft → critique → gate.
 */
export class SelfRAGService {
  private prisma: PrismaClient;
  private openai: OpenAI;
  private grader: ReflectionGrader;
  private corrective: CorrectiveRAG<SelfRAGDocument>;
  private maxRetries: number;
  private model: string;
  private temperature: number;
  private correctiveAttempts: number;
  private enableWebExpansion: boolean;

  constructor(prismaClient?: PrismaClient, openaiClient?: OpenAI, options: SelfRAGOptions = {}) {
    this.prisma = prismaClient || new PrismaClient();
    this.openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.grader = new ReflectionGrader(this.prisma, this.openai, {
      relThreshold: options.relThreshold,
      supThreshold: options.supThreshold,
      useThreshold: options.useThreshold,
      model: process.env.SELF_RAG_MODEL || 'gpt-4o-mini',
    });
    this.correctiveAttempts = Number(
      process.env.SELF_RAG_CORRECTIVE_MAX_ATTEMPTS || 2,
    );
    this.enableWebExpansion =
      (process.env.SELF_RAG_ENABLE_WEB_EXPANSION || 'false') === 'true';
    this.corrective = new CorrectiveRAG<SelfRAGDocument>(this.openai, {
      maxAttempts: this.correctiveAttempts,
      model: process.env.SELF_RAG_MODEL || 'gpt-4o-mini',
      enableWebExpansion: this.enableWebExpansion,
    });
    this.maxRetries = options.maxRetries ?? Number(process.env.SELF_RAG_MAX_RETRIES || 2);
    const llmConfig = getLLMConfig('reasoning');
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.temperature = options.temperature ?? llmConfig.temperature ?? 0.3;
  }

  /**
  run full Self-RAG pipeline. retrievalFn is required when RET is high.
   */
  async run(
    query: string,
    retrievalFn: RetrievalFn<SelfRAGDocument> | undefined,
    options?: { queryId?: string },
  ): Promise<SelfRAGResult> {
    // Assess need for retrieval (RET)
    const assess = await this.grader.score({ query });
    const needRetrieval = assess.pass.RET;

    let docs: SelfRAGDocument[] = [];
    let correctiveMeta: Record<string, unknown> | undefined;

    if (needRetrieval && retrievalFn) {
      docs = await retrievalFn(query);
      // REL scoring for retrieved docs
      const rel = await this.grader.score({ query, retrievedDocs: docs, queryId: options?.queryId });
      if (!rel.pass.REL) {
        const corrective = await this.corrective.attempt(query, retrievalFn);
        docs = corrective.docs;
        if (!docs.length) {
          return {
            response: null,
            abstain: true,
            reflection: rel,
            docsUsed: [],
            metadata: {
              corrective: {
                rewrittenQuery: corrective.rewrittenQuery,
                expandedQuery: corrective.expandedQuery,
                attempts: corrective.attempts,
                reason: 'low_relevance_after_corrective',
              },
            },
          };
        }
        correctiveMeta = {
          rewrittenQuery: corrective.rewrittenQuery,
          expandedQuery: corrective.expandedQuery,
          attempts: corrective.attempts,
        };
      }
    }

    // Draft and critique loop
    let attempts = 0;
    let lastReflection: ReflectionResult | undefined;
    let lastResponse: string | null = null;
    while (attempts <= this.maxRetries) {
      attempts += 1;
      const draft = await this.generateDraft(query, docs);
      const critique = await this.grader.score({
        query,
        retrievedDocs: docs,
        response: draft,
        queryId: options?.queryId,
      });
      lastReflection = critique;
      lastResponse = draft;

      if (critique.pass.SUP && critique.pass.USE) {
        return {
          response: draft,
          abstain: false,
          reflection: critique,
          docsUsed: docs,
          metadata: correctiveMeta ? { corrective: correctiveMeta } : undefined,
        };
      }

      if (attempts > this.maxRetries) {
        break;
      }
    }

    return {
      response: null,
      abstain: true,
      reflection: lastReflection,
      docsUsed: docs,
      metadata: {
        ...(correctiveMeta ? { corrective: correctiveMeta } : {}),
        reason: 'failed_sup_use_after_retries',
      },
    };
  }

  private async generateDraft(
    query: string,
    docs: SelfRAGDocument[],
  ): Promise<string> {
    const context =
      docs && docs.length
        ? docs
            .map(
              (d, idx) =>
                `Document ${idx + 1}${d.id ? ` (${d.id})` : ''}: ${d.content}`,
            )
            .join('\n\n')
        : 'No external documents retrieved.';

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'Answer the user. If documents are provided, ground your answer in them. If unsupported, say "I don\'t know."',
        },
        { role: 'user', content: `Question: ${query}\n\nContext:\n${context}` },
      ],
    });

    return completion.choices[0]?.message?.content ?? "I don't know.";
  }
}
