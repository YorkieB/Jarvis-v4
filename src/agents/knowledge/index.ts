import { BaseAgent } from '../base-agent';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import logger from '../../utils/logger';
import { ReflectionGrader } from '../../services/selfRAG/reflectionGrader';
import { CorrectiveRAG } from '../../services/selfRAG/correctiveRAG';

interface KnowledgeDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
}

export class KnowledgeAgent extends BaseAgent {
  protected agentType = 'knowledge';
  protected permissions = ['read:knowledge_base', 'write:knowledge_base'];

  private openai: OpenAI;
  private prisma: PrismaClient;
  private grader: ReflectionGrader;
  private corrective: CorrectiveRAG<KnowledgeDocument>;

  constructor(prismaClient?: PrismaClient) {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.prisma = prismaClient || new PrismaClient();
    this.grader = new ReflectionGrader(this.prisma, this.openai);
    this.corrective = new CorrectiveRAG<KnowledgeDocument>(this.openai, {
      maxAttempts: 1,
    });
  }

  async retrieveRelevantDocs(
    query: string,
    limit: number = 5,
    useCorrective: boolean = true,
  ): Promise<KnowledgeDocument[]> {
    const docs = await this.fetchVectorDocs(query, limit);
    if (!docs.length) return [];

    const rel = await this.grader.score({ query, retrievedDocs: docs });
    const relPass =
      rel?.pass?.REL ??
      rel.scores.REL >= Number(process.env.SELF_RAG_REL_THRESHOLD || 0.5);

    if (!relPass && useCorrective) {
      const corrective = await this.corrective.attempt(query, (q) =>
        this.fetchVectorDocs(q, limit),
      );
      if (!corrective.docs.length) {
        return [];
      }
      return corrective.docs.map((d) => ({
        ...d,
        metadata: {
          ...(d.metadata || {}),
          correctiveQuery: corrective.rewrittenQuery,
          correctiveExpandedQuery: corrective.expandedQuery,
          correctiveAttempts: corrective.attempts,
        },
      }));
    }

    return docs.map((doc) => ({
      ...doc,
      metadata: {
        ...(doc.metadata || {}),
        relScore: rel.scores.REL,
        relPass: rel.pass.REL,
      },
    }));
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  }

  async ingestDocument(
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const chunks = this.chunkDocument(content);

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk);
      const embeddingString = `[${embedding.join(',')}]`;
      const id = randomUUID();

      try {
        await this.prisma.$executeRawUnsafe(
          `
          INSERT INTO "KnowledgeBase" (id, content, embedding, metadata, "createdAt")
          VALUES ($1, $2, $3::vector, $4, NOW())
        `,
          id,
          chunk,
          embeddingString,
          metadata,
        );
      } catch (error) {
        logger.error('KnowledgeAgent: failed to store chunk', { error });
      }
    }
  }

  private chunkDocument(content: string, chunkSize: number = 500): string[] {
    const words = content.split(' ');
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }

    return chunks;
  }

  private async fetchVectorDocs(
    query: string,
    limit: number,
  ): Promise<KnowledgeDocument[]> {
    const embedding = await this.generateEmbedding(query);
    const embeddingString = `[${embedding.join(',')}]`;

    try {
      const results = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          content: string;
          metadata: Record<string, unknown> | null;
          similarity: number;
        }>
      >(
        `
        SELECT id, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity
        FROM "KnowledgeBase"
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
        embeddingString,
        limit,
      );

      return results.map((row) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata || undefined,
        similarity: row.similarity,
      }));
    } catch (error) {
      logger.error('KnowledgeAgent: pgvector query failed', { error });
      return [];
    }
  }
}
