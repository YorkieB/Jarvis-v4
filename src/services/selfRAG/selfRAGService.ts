import OpenAI from 'openai';
import { ReflectionGrader, ReflectionResult } from './reflectionGrader';
import { CorrectiveRAG, RetrievalFn } from './correctiveRAG';
import { getLLMConfig } from '../../config/llmConfig';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;

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
  private readonly prisma: PrismaClient;
  private readonly openai: OpenAI;
  private readonly grader: ReflectionGrader;
  private readonly corrective: CorrectiveRAG<SelfRAGDocument>;
  private readonly maxRetries: number;
  private readonly model: string;
  private readonly temperature: number;
  private readonly correctiveAttempts: number;
  private readonly enableWebExpansion: boolean;

  constructor(prismaClient?: PrismaClient, openaiClient?: OpenAI, options: SelfRAGOptions = {}) {
    this.prisma = prismaClient || globalPrisma;
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
    const assess = await this.grader.score({ query });
    const needRetrieval = assess.pass.RET;

    let docs: SelfRAGDocument[] = [];
    let correctiveMeta: Record<string, unknown> | undefined;

    if (needRetrieval && retrievalFn) {
      const retrieval = await this.retrieveWithCorrective(query, retrievalFn, options?.queryId);
      if (retrieval.aborted) {
        return {
          response: null,
          abstain: true,
          reflection: retrieval.reflection,
          docsUsed: [],
          metadata: retrieval.correctiveMeta
            ? { corrective: retrieval.correctiveMeta }
            : undefined,
        };
      }
      docs = retrieval.docs;
      correctiveMeta = retrieval.correctiveMeta;
    }

    return this.draftAndCritique(query, docs, options?.queryId, correctiveMeta);
  }

  private async retrieveWithCorrective(
    query: string,
    retrievalFn: RetrievalFn<SelfRAGDocument>,
    queryId?: string,
  ): Promise<{
    docs: SelfRAGDocument[];
    correctiveMeta?: Record<string, unknown>;
    reflection?: ReflectionResult;
    aborted: boolean;
  }> {
    const docs = await retrievalFn(query);
    const rel = await this.grader.score({ query, retrievedDocs: docs, queryId });
    if (rel.pass.REL) {
      return { docs, aborted: false };
    }

    const corrective = await this.corrective.attempt(query, retrievalFn);
    if (!corrective.docs.length) {
      return {
        docs: [],
        correctiveMeta: {
          rewrittenQuery: corrective.rewrittenQuery,
          expandedQuery: corrective.expandedQuery,
          attempts: corrective.attempts,
          reason: 'low_relevance_after_corrective',
        },
        reflection: rel,
        aborted: true,
      };
    }

    return {
      docs: corrective.docs,
      correctiveMeta: {
        rewrittenQuery: corrective.rewrittenQuery,
        expandedQuery: corrective.expandedQuery,
        attempts: corrective.attempts,
      },
      aborted: false,
    };
  }

  private async draftAndCritique(
    query: string,
    docs: SelfRAGDocument[],
    queryId?: string,
    correctiveMeta?: Record<string, unknown>,
  ): Promise<SelfRAGResult> {
    let attempts = 0;
    let lastReflection: ReflectionResult | undefined;

    while (attempts <= this.maxRetries) {
      attempts += 1;
      const draft = await this.generateDraft(query, docs);
      const critique = await this.grader.score({
        query,
        retrievedDocs: docs,
        response: draft,
        queryId,
      });
      lastReflection = critique;

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
      docs?.length
        ? docs
            .map((d, idx) => {
              const idSuffix = d.id ? ` (${d.id})` : '';
              return `Document ${idx + 1}${idSuffix}: ${d.content}`;
            })
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
