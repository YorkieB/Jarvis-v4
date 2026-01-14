/**
 * List available backups script
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import BackupService from '../services/backupService';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const prisma = new PrismaClient();
  const backupService = new BackupService(prisma);

  try {
    const backups = await backupService.listBackups();

    console.log('\nAvailable Backups:');
    console.log('==================\n');

    if (backups.length === 0) {
      console.log('No backups found.\n');
      process.exit(0);
    }

    backups.forEach((backup, index) => {
      const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
      const age = Math.floor(
        (Date.now() - backup.timestamp.getTime()) / (1000 * 60 * 60 * 24),
      );
      console.log(`${index + 1}. ${path.basename(backup.path)}`);
      console.log(`   Size: ${sizeMB} MB`);
      console.log(`   Age: ${age} days`);
      console.log(`   Date: ${backup.timestamp.toISOString()}`);
      if (backup.checksum) {
        console.log(`   Checksum: ${backup.checksum.substring(0, 16)}...`);
      }
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Failed to list backups:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
