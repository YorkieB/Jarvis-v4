import { Prisma } from '@prisma/client';
import { GraphState } from './types';
import { prisma as globalPrisma } from '../../utils/prisma';

type PrismaClient = typeof globalPrisma;

function serializeState(
  state: GraphState,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (state === null) {
    return Prisma.JsonNull;
  }
  return state as Prisma.InputJsonValue;
}

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
        state: serializeState(state),
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
