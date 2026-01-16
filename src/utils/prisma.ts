import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // Fail fast so callers see a clear message instead of constructor errors
  throw new Error('DATABASE_URL is required to initialize Prisma');
}

const pool = new Pool({ connectionString: databaseUrl });

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  // Keep logs minimal by default; enable query logging via env toggle
  log:
    process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
});

export type PrismaInstance = typeof prisma;
