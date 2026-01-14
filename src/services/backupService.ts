/**
 * Backup Service
 * Handles database backups, conversation exports, and backup management
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

interface BackupInfo {
  path: string;
  timestamp: Date;
  size: number;
  checksum?: string;
}

class BackupService {
  private prisma: PrismaClient;
  private backupDir: string;
  private readonly DEFAULT_BACKUP_DIR = '/var/backups/jarvis';
  private readonly RETENTION_DAYS = 30;

  constructor(prisma: PrismaClient, backupDir?: string) {
    this.prisma = prisma;
    this.backupDir = backupDir || process.env.BACKUP_DIR || this.DEFAULT_BACKUP_DIR;

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      logger.info('Created backup directory', { path: this.backupDir });
    }
  }

  /**
   * Generate backup filename with timestamp
   */
  private generateBackupFilename(): string {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    return `jarvis-backup-${timestamp}.sql.gz`;
  }

  /**
   * Calculate file checksum (SHA256)
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Create full database backup using pg_dump
   */
  async createBackup(): Promise<string> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    const filename = this.generateBackupFilename();
    const backupPath = path.join(this.backupDir, filename);

    try {
      // Parse database URL to extract connection details
      const url = new URL(dbUrl);
      const dbName = url.pathname.slice(1); // Remove leading /
      const dbHost = url.hostname;
      const dbPort = url.port || '5432';
      const dbUser = url.username;
      const dbPassword = url.password;

      // Set PGPASSWORD environment variable for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: dbPassword,
      };

      // Create backup using pg_dump
      const command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F c -f ${backupPath}.tmp 2>&1 && gzip -c ${backupPath}.tmp > ${backupPath} && rm ${backupPath}.tmp`;

      logger.info('Starting database backup', { backupPath });

      const { stdout, stderr } = await execAsync(command, { env });

      if (stderr && !stderr.includes('WARNING')) {
        throw new Error(`pg_dump error: ${stderr}`);
      }

      // Calculate checksum
      const checksum = await this.calculateChecksum(backupPath);
      const stats = fs.statSync(backupPath);

      // Save backup metadata
      const metadataPath = backupPath + '.meta';
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          checksum,
          size: stats.size,
          database: dbName,
        }),
      );

      logger.info('Backup created successfully', {
        path: backupPath,
        size: stats.size,
        checksum,
      });

      return backupPath;
    } catch (error) {
      logger.error('Backup creation failed', { error, backupPath });
      // Clean up partial backup if it exists
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      throw error;
    }
  }

  /**
   * Export conversations to JSON format
   */
  async exportConversations(userId?: string): Promise<string> {
    try {
      const where = userId ? { userId } : {};

      const conversations = await this.prisma.conversation.findMany({
        where,
        include: {
          messages: {
            orderBy: {
              timestamp: 'asc',
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      const exportData = {
        exportDate: new Date().toISOString(),
        userId: userId || 'all',
        conversationCount: conversations.length,
        conversations,
      };

      const filename = userId
        ? `conversations-${userId}-${Date.now()}.json`
        : `conversations-all-${Date.now()}.json`;
      const exportPath = path.join(this.backupDir, filename);

      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

      logger.info('Conversations exported', {
        path: exportPath,
        count: conversations.length,
        userId: userId || 'all',
      });

      return exportPath;
    } catch (error) {
      logger.error('Failed to export conversations', { userId, error });
      throw error;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        logger.error('Backup file not found', { backupPath });
        return false;
      }

      // Check metadata file
      const metadataPath = backupPath + '.meta';
      if (!fs.existsSync(metadataPath)) {
        logger.warn('Backup metadata not found', { metadataPath });
        return false;
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      // Verify checksum
      const currentChecksum = await this.calculateChecksum(backupPath);
      if (currentChecksum !== metadata.checksum) {
        logger.error('Backup checksum mismatch', {
          expected: metadata.checksum,
          actual: currentChecksum,
        });
        return false;
      }

      // Verify file size
      const stats = fs.statSync(backupPath);
      if (stats.size !== metadata.size) {
        logger.error('Backup size mismatch', {
          expected: metadata.size,
          actual: stats.size,
        });
        return false;
      }

      logger.info('Backup verification passed', { backupPath });
      return true;
    } catch (error) {
      logger.error('Backup verification failed', { backupPath, error });
      return false;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.startsWith('jarvis-backup-') && file.endsWith('.sql.gz')) {
          const backupPath = path.join(this.backupDir, file);
          const stats = fs.statSync(backupPath);

          // Try to load metadata
          const metadataPath = backupPath + '.meta';
          let checksum: string | undefined;
          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf-8'),
              );
              checksum = metadata.checksum;
            } catch {
              // Ignore metadata read errors
            }
          }

          backups.push({
            path: backupPath,
            timestamp: stats.mtime,
            size: stats.size,
            checksum,
          });
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return backups;
    } catch (error) {
      logger.error('Failed to list backups', { error });
      return [];
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(retentionDays: number = this.RETENTION_DAYS): Promise<void> {
    try {
      const backups = await this.listBackups();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;
      for (const backup of backups) {
        if (backup.timestamp < cutoffDate) {
          try {
            fs.unlinkSync(backup.path);
            // Also delete metadata if it exists
            const metadataPath = backup.path + '.meta';
            if (fs.existsSync(metadataPath)) {
              fs.unlinkSync(metadataPath);
            }
            deletedCount++;
            logger.info('Deleted old backup', {
              path: backup.path,
              age: Math.floor(
                (Date.now() - backup.timestamp.getTime()) / (1000 * 60 * 60 * 24),
              ),
            });
          } catch (error) {
            logger.error('Failed to delete backup', {
              path: backup.path,
              error,
            });
          }
        }
      }

      logger.info('Backup cleanup completed', {
        deletedCount,
        retentionDays,
      });
    } catch (error) {
      logger.error('Backup cleanup failed', { error });
      throw error;
    }
  }

  /**
   * Restore database from backup
   * WARNING: This will overwrite existing data
   */
  async restoreBackup(backupPath: string): Promise<void> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    // Verify backup first
    const isValid = await this.verifyBackup(backupPath);
    if (!isValid) {
      throw new Error('Backup verification failed. Cannot restore.');
    }

    try {
      const url = new URL(dbUrl);
      const dbName = url.pathname.slice(1);
      const dbHost = url.hostname;
      const dbPort = url.port || '5432';
      const dbUser = url.username;
      const dbPassword = url.password;

      const env = {
        ...process.env,
        PGPASSWORD: dbPassword,
      };

      // Decompress and restore
      const command = `gunzip -c ${backupPath} | pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --clean --if-exists 2>&1`;

      logger.warn('Starting database restore', {
        backupPath,
        database: dbName,
      });

      const { stdout, stderr } = await execAsync(command, { env });

      if (stderr && !stderr.includes('WARNING')) {
        throw new Error(`pg_restore error: ${stderr}`);
      }

      logger.info('Database restore completed successfully', { backupPath });
    } catch (error) {
      logger.error('Database restore failed', { backupPath, error });
      throw error;
    }
  }
}

export default BackupService;
export type { BackupInfo };
