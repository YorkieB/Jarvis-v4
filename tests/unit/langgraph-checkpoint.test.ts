import { CheckpointAdapter } from '../../src/services/langgraph/checkpointAdapter';
import { prisma as globalPrisma } from '../../src/utils/prisma';

type PrismaClient = typeof globalPrisma;

interface MockPrismaClient {
  graphCheckpoint: {
    create: (args: {
      data: { graphId: string; nodeId: string; state: unknown; runId?: string };
    }) => Promise<void>;
    findFirst: (args: {
      where: { graphId: string; runId?: string };
      orderBy?: { timestamp: 'desc' };
    }) => Promise<{
      graphId: string;
      nodeId: string;
      state: unknown;
      runId?: string;
      timestamp: Date;
    } | null>;
  };
}

class FakePrisma implements MockPrismaClient {
  records: Array<{
    graphId: string;
    nodeId: string;
    state: unknown;
    runId?: string;
    timestamp: Date;
  }> = [];

  graphCheckpoint = {
    create: async ({
      data,
    }: {
      data: { graphId: string; nodeId: string; state: unknown; runId?: string };
    }) => {
      const timestamp = new Date(Date.now() + this.records.length);
      this.records.push({ ...data, timestamp });
    },
    findFirst: async ({
      where,
      orderBy: _orderBy,
    }: {
      where: { graphId: string; runId?: string };
      orderBy?: { timestamp: 'desc' };
    }) => {
      const filtered = this.records.filter(
        (r) =>
          r.graphId === where.graphId &&
          (where.runId ? r.runId === where.runId : true),
      );
      if (filtered.length === 0) return null;
      return filtered.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      )[0];
    },
  };
}

describe('CheckpointAdapter', () => {
  it('loads latest checkpoint scoped by runId', async () => {
    const prisma = new FakePrisma();
    const adapter = new CheckpointAdapter(prisma as unknown as PrismaClient);

    await adapter.save('graph-1', 'node-a', { step: 1 }, 'run-A');
    await adapter.save('graph-1', 'node-b', { step: 2 }, 'run-A');
    await adapter.save('graph-1', 'node-c', { step: 3 }, 'run-B');

    const latestRunA = await adapter.loadLatest('graph-1', 'run-A');
    expect(latestRunA?.nodeId).toBe('node-b');
    expect(latestRunA?.state).toEqual({ step: 2 });

    const latestAny = await adapter.loadLatest('graph-1');
    expect(latestAny?.nodeId).toBe('node-c');
    expect(latestAny?.state).toEqual({ step: 3 });
  });
});
