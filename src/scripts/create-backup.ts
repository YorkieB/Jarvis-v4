/**
 * Create database backup script
 * Can be run manually or via cron
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

  try {
    logger.info('Starting backup creation...');
    const backupPath = await backupService.createBackup();
    logger.info('Backup created successfully', { path: backupPath });

    // Also export conversations
    const exportPath = await backupService.exportConversations();
    logger.info('Conversations exported', { path: exportPath });

    process.exit(0);
  } catch (error) {
    logger.error('Backup creation failed', { error });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
