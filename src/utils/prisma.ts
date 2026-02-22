import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
  });
}

let _prisma: PrismaClient | undefined;

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = createPrismaClient();
    }
    const val = (_prisma as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? val.bind(_prisma) : val;
  },
});

export type PrismaInstance = typeof prisma;
