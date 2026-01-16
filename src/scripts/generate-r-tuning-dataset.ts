/**
 * CLI: Generate R-Tuning dataset of unanswerable questions.
 */
import { DatasetGenerator, RTuningCategory } from '../services/rTuning/datasetGenerator';
import logger from '../utils/logger';

function getArg(name: string, defaultValue?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return defaultValue;
}

async function main() {
  const targetSize = parseInt(getArg('--size', '5000') || '5000', 10);
  const categoryArg = getArg('--categories');
  const categories = categoryArg
    ? (categoryArg.split(',').map((c) => c.trim()) as RTuningCategory[])
    : null;

  const generator = new DatasetGenerator();

  if (categories && categories.length > 0) {
    let totalCreated = 0;
    for (const category of categories) {
      const items = await generator.generateCategory(category, Math.floor(targetSize / categories.length));
      const created = await generator.saveItems(items);
      totalCreated += created;
      logger.info(`Category ${category}: created ${created} items`);
    }
    logger.info('R-Tuning dataset generation finished (category subset)', {
      totalCreated,
      categories,
    });
  } else {
    const result = await generator.generateFullDataset(targetSize);
    logger.info('R-Tuning dataset generation finished', result);
  }
}

main().catch((error) => {
  logger.error('Failed to generate R-Tuning dataset', { error });
  process.exit(1);
});
