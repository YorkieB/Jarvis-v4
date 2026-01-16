/**
 * CLI: Export R-Tuning dataset to JSONL (OpenAI) or JSON (local).
 */
import fs from 'fs';
import path from 'path';
import { RefusalTrainer } from '../services/rTuning/refusalTrainer';
import logger from '../utils/logger';
import { prisma } from '../utils/prisma';

function getArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return defaultValue;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const trainer = new RefusalTrainer();

  const format = (getArg('--format', 'jsonl') || 'jsonl').toLowerCase();
  const includeAll = hasFlag('--all');

  const entries = await prisma.rTuningDataset.findMany({
    where: includeAll ? {} : { isValidated: true },
    orderBy: { createdAt: 'asc' },
  });

  const content =
    format === 'json'
      ? trainer.exportForLocalTraining(entries)
      : trainer.exportForOpenAIFineTuning(entries);

  const baseDir = path.resolve(process.env.R_TUNING_EXPORT_BASE || 'data');
  const fileName =
    format === 'json' ? 'r-tuning-dataset.json' : 'r-tuning-dataset.jsonl';
  const outPath = path.join(baseDir, fileName);
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
