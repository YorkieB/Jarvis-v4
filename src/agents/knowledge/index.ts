import { BaseAgent } from '../base-agent';
import OpenAI from 'openai';

interface KnowledgeDocument {
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export class KnowledgeAgent extends BaseAgent {
  protected agentType = 'knowledge';
  protected permissions = ['read:knowledge_base', 'write:knowledge_base'];

  private openai: OpenAI;

  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async retrieveRelevantDocs(
    query: string,
    _limit: number = 5,
  ): Promise<KnowledgeDocument[]> {
    // Generate embedding for query
    await this.generateEmbedding(query);

    // TODO: Query pgvector database
    // SELECT * FROM knowledge_base
    // ORDER BY embedding <-> $1::vector
    // LIMIT $2

    return [];
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
    _metadata: Record<string, unknown>,
  ): Promise<void> {
    // Chunk document
    const chunks = this.chunkDocument(content);

    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      await this.generateEmbedding(chunk);

      // TODO: Store in database with pgvector
      // INSERT INTO knowledge_base (content, embedding, metadata)
      // VALUES ($1, $2::vector, $3)
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
}
