/**
 * Semantic Entropy Calculator
 * 
 * Implements semantic entropy to measure uncertainty over meaning rather than tokens.
 * Groups semantically equivalent responses into clusters and calculates entropy over clusters.
 */

import OpenAI from 'openai';
import logger from '../../utils/logger';

export interface SemanticCluster {
  id: number;
  responses: string[];
  centroid: number[]; // Embedding vector
  probability: number;
}

export interface SemanticEntropyResult {
  entropy: number;
  clusters: SemanticCluster[];
  clusterCount: number;
  totalResponses: number;
}

export class SemanticEntropyCalculator {
  private readonly openai: OpenAI;
  private readonly similarityThreshold: number;

  constructor(similarityThreshold: number = 0.85) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Calculate semantic entropy for a set of candidate responses
   * 
   * @param query - Original query
   * @param responses - Array of candidate responses (5-10 recommended)
   * @returns Semantic entropy result with clusters and entropy score
   */
  async calculate(
    query: string,
    responses: string[],
  ): Promise<SemanticEntropyResult> {
    if (responses.length === 0) {
      return {
        entropy: 0,
        clusters: [],
        clusterCount: 0,
        totalResponses: 0,
      };
    }

    if (responses.length === 1) {
      return {
        entropy: 0,
        clusters: [
          {
            id: 0,
            responses: responses,
            centroid: await this.generateEmbedding(responses[0]),
            probability: 1,
          },
        ],
        clusterCount: 1,
        totalResponses: 1,
      };
    }

    // Generate embeddings for all responses
    const embeddings = await Promise.all(
      responses.map((r) => this.generateEmbedding(r)),
    );

    // Cluster semantically equivalent responses
    const clusters = this.clusterResponses(responses, embeddings);

    // Calculate entropy over clusters
    const entropy = this.calculateEntropy(clusters);

    logger.debug('Semantic entropy calculated', {
      query: query.substring(0, 50),
      responseCount: responses.length,
      clusterCount: clusters.length,
      entropy,
    });

    return {
      entropy,
      clusters,
      clusterCount: clusters.length,
      totalResponses: responses.length,
    };
  }

  /**
   * Cluster responses based on semantic similarity
   */
  private clusterResponses(
    responses: string[],
    embeddings: number[][],
  ): SemanticCluster[] {
    const clusters: SemanticCluster[] = [];
    const assigned: boolean[] = new Array(responses.length).fill(false);

    for (let i = 0; i < responses.length; i++) {
      if (assigned[i]) continue;

      // Start new cluster
      const cluster: SemanticCluster = {
        id: clusters.length,
        responses: [responses[i]],
        centroid: [...embeddings[i]],
        probability: 0,
      };

      // Find all semantically similar responses
      for (let j = i + 1; j < responses.length; j++) {
        if (assigned[j]) continue;

        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity >= this.similarityThreshold) {
          cluster.responses.push(responses[j]);
          assigned[j] = true;
          // Update centroid (simple average)
          cluster.centroid = this.averageVectors([
            cluster.centroid,
            embeddings[j],
          ]);
        }
      }

      assigned[i] = true;
      clusters.push(cluster);
    }

    // Calculate cluster probabilities
    const total = responses.length;
    clusters.forEach((cluster) => {
      cluster.probability = cluster.responses.length / total;
    });

    return clusters;
  }

  /**
   * Calculate Shannon entropy over clusters
   * Formula: H = -Σ(p_i * log2(p_i))
   */
  private calculateEntropy(clusters: SemanticCluster[]): number {
    if (clusters.length === 0) return 0;
    if (clusters.length === 1) return 0; // No uncertainty if all responses cluster together

    let entropy = 0;
    for (const cluster of clusters) {
      if (cluster.probability > 0) {
        entropy -= cluster.probability * Math.log2(cluster.probability);
      }
    }

    return entropy;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Average multiple vectors (for centroid calculation)
   */
  private averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return [...vectors[0]];

    const dim = vectors[0].length;
    const avg = new Array(dim).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        avg[i] += vec[i];
      }
    }

    const count = vectors.length;
    return avg.map((val) => val / count);
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding for semantic entropy', {
        error,
        text: text.substring(0, 100),
      });
      throw error;
    }
  }
}
