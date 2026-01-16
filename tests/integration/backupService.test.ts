import fs from 'fs';
import os from 'os';
import path from 'path';
import BackupService from '../../src/services/backupService';

jest.mock('child_process', () => {
  const realFs = require('fs') as typeof fs;
  return {
    exec: (
      cmd: string,
      _opts: unknown,
      cb: (err: unknown, stdout: string, stderr: string) => void,
    ) => {
      const match = cmd.match(/-f\s+(\S+)\.tmp.*>\s+(\S+)/);
      if (match) {
        const tmpPath = match[1];
        const backupPath = match[2];
        realFs.writeFileSync(`${tmpPath}`, 'dump');
        realFs.writeFileSync(`${backupPath}`, 'dump');
      }
      cb(null, '', '');
    },
  };
});

describe('BackupService (integration-mocked)', () => {
  const originalEnv = { ...process.env };
  let backupDir: string;
  let prisma: any;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/jarvis',
    };
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-svc-'));
    prisma = {
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it('creates backup and metadata, lists backups', async () => {
    const service = new BackupService(prisma, backupDir);
    const backupPath = await service.createBackup();

    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.existsSync(`${backupPath}.meta`)).toBe(true);

    const backups = await service.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].path).toBe(backupPath);
  });

  it('cleans up old backups by retention', async () => {
    const service = new BackupService(prisma, backupDir);

    const oldPath = path.join(backupDir, 'jarvis-backup-old.sql.gz');
    fs.writeFileSync(oldPath, 'old');
    fs.utimesSync(
      oldPath,
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    );

    const freshPath = path.join(backupDir, 'jarvis-backup-new.sql.gz');
    fs.writeFileSync(freshPath, 'new');

    await service.cleanupOldBackups(2);

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(freshPath)).toBe(true);
  });
});
