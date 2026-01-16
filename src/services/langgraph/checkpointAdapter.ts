import { GraphState } from './types';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;

export class CheckpointAdapter {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || globalPrisma;
  }

  async save(
    graphId: string,
    nodeId: string,
    state: GraphState,
    runId?: string,
  ): Promise<void> {
    await this.prisma.graphCheckpoint.create({
      data: {
        graphId,
        nodeId,
        state,
        runId,
      },
    });
  }

  async loadLatest(
    graphId: string,
    runId?: string,
  ): Promise<{ nodeId: string; state: GraphState } | null> {
    const checkpoint = await this.prisma.graphCheckpoint.findFirst({
      where: { graphId, ...(runId ? { runId } : {}) },
      orderBy: { timestamp: 'desc' },
    });
    if (!checkpoint) return null;
    return { nodeId: checkpoint.nodeId, state: checkpoint.state as GraphState };
  }
}
