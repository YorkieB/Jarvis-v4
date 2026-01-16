/**
 * CLI: Export R-Tuning dataset to JSONL (OpenAI) or JSON (local).
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { RefusalTrainer } from '../services/rTuning/refusalTrainer';
import logger from '../utils/logger';

function getArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return defaultValue;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const prisma = new PrismaClient();
  const trainer = new RefusalTrainer();

  const format = (getArg('--format', 'jsonl') || 'jsonl').toLowerCase();
  const includeAll = hasFlag('--all');
  const outArg = getArg(
    '--out',
    format === 'json' ? 'data/r-tuning-dataset.json' : 'data/r-tuning-dataset.jsonl',
  );

  const entries = await prisma.rTuningDataset.findMany({
    where: includeAll ? {} : { isValidated: true },
    orderBy: { createdAt: 'asc' },
  });

  const content =
    format === 'json'
      ? trainer.exportForLocalTraining(entries)
      : trainer.exportForOpenAIFineTuning(entries);

  const outPath = path.resolve(outArg);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');

  logger.info('Exported R-Tuning dataset', {
    format,
    outPath,
    count: entries.length,
    includeAll,
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  logger.error('Failed to export R-Tuning dataset', { error });
  process.exit(1);
});
