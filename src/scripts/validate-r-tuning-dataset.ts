/**
 * CLI: Validate R-Tuning dataset quality.
 */
import { DatasetValidator } from '../services/rTuning/datasetValidator';
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
  const validator = new DatasetValidator(prisma);
  const limit = parseInt(getArg('--limit') || '0', 10);
  const fix = hasFlag('--fix');

  const items = await prisma.rTuningDataset.findMany({
    take: limit > 0 ? limit : undefined,
    orderBy: { createdAt: 'asc' },
  });

  logger.info('Validating R-Tuning dataset', { count: items.length, limit, fix });

  const report = await validator.validateDataset(items);
  logger.info('Validation report', {
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    averageScore: report.averageScore,
    duplicates: report.duplicates.length,
  });

  if (fix && report.duplicates.length) {
    await prisma.rTuningDataset.deleteMany({
      where: { id: { in: report.duplicates } },
    });
    logger.warn('Removed duplicate questions', { removed: report.duplicates.length });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  logger.error('Failed to validate R-Tuning dataset', { error });
  process.exit(1);
});
