/**
 * Cleanup old backups script
 * Removes backups older than retention period
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import BackupService from '../services/backupService';
import logger from '../utils/logger';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const prisma = new PrismaClient();
  const backupService = new BackupService(prisma);

  const retentionDays =
    parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10) || 30;

  try {
    logger.info('Starting backup cleanup', { retentionDays });
    await backupService.cleanupOldBackups(retentionDays);
    logger.info('Backup cleanup completed');
    process.exit(0);
  } catch (error) {
    logger.error('Backup cleanup failed', { error });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
