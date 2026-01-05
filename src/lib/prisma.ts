import { PrismaClient } from '../generated/prisma';

// Singleton pattern for Prisma Client
let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    // Prisma 7 requires at least an empty options object
    prisma = new PrismaClient({});
  }
  return prisma;
}


