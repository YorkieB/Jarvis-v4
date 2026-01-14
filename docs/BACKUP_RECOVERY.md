# Backup and Recovery Guide

## Overview

Jarvis v4 includes automated database backups to protect conversation history and user data. This guide covers backup creation, restoration, and recovery procedures.

## Backup Types

### Automated Backups

- **Daily Backups**: Created at 2 AM, kept for 30 days
- **Weekly Backups**: Created on Sundays at 3 AM, kept for 12 weeks
- **Monthly Backups**: Created on 1st of month at 4 AM, kept for 12 months

### Manual Backups

Backups can be created on-demand using:
- API endpoint: `POST /api/backup/create`
- Script: `npm run backup:create`
- Shell script: `./scripts/backup-db.sh`

## Backup Storage

- **Location**: `/var/backups/jarvis/` (configurable via `BACKUP_DIR` env var)
- **Format**: Compressed PostgreSQL dumps (`.sql.gz`)
- **Naming**: `jarvis-backup-YYYYMMDD-HHMMSS.sql.gz`
- **Metadata**: Each backup includes `.meta` and `.sha256` files for verification

## Creating Backups

### Via API

```bash
curl -X POST http://localhost:3000/api/backup/create
```

### Via Script

```bash
npm run backup:create
```

### Via Shell Script

```bash
./scripts/backup-db.sh
```

## Listing Backups

### Via API

```bash
curl http://localhost:3000/api/backup/list
```

### Via Script

```bash
npm run backup:list
```

## Restoring Backups

### Via Shell Script (Recommended)

```bash
./scripts/restore-db.sh /var/backups/jarvis/jarvis-backup-20260114-020000.sql.gz
```

The script will:
1. Verify backup file exists
2. Check backup checksum
3. Prompt for confirmation
4. Restore database

### Manual Restore

```bash
# Decompress backup
gunzip -c jarvis-backup-20260114-020000.sql.gz > restore.sql

# Restore database
pg_restore -h localhost -U jarvis -d jarvis --clean --if-exists restore.sql
```

## Recovery Scenarios

### Server Crash

1. Identify latest backup: `npm run backup:list`
2. Restore from backup: `./scripts/restore-db.sh <backup-file>`
3. Verify database: `npm run db:studio`
4. Restart application: `pm2 restart jarvis`

### Data Corruption

1. Stop application: `pm2 stop jarvis`
2. Identify last known good backup
3. Restore from backup
4. Verify data integrity
5. Restart application

### Accidental Deletion

1. Identify backup before deletion occurred
2. Restore from backup
3. Export specific conversation/user data if needed
4. Re-import into current database

### Database Migration Issues

1. Restore from backup before migration
2. Review migration scripts
3. Fix migration issues
4. Re-run migration
5. Verify data integrity

## Backup Verification

All backups include checksums for integrity verification:

```bash
# Verify checksum
sha256sum -c jarvis-backup-20260114-020000.sql.gz.sha256
```

## Cleanup Old Backups

Automated cleanup runs daily at 5 AM. Manual cleanup:

```bash
npm run backup:cleanup
```

Or specify retention days:

```bash
BACKUP_RETENTION_DAYS=60 npm run backup:cleanup
```

## Backup Best Practices

1. **Test Restores Regularly**: Verify backups can be restored
2. **Monitor Backup Success**: Check logs for backup failures
3. **Store Off-Site**: Consider cloud storage for critical backups
4. **Document Recovery Procedures**: Keep this guide updated
5. **Regular Verification**: Verify backup integrity periodically

## Troubleshooting

**Backup Creation Fails:**
- Check `DATABASE_URL` is set correctly
- Verify PostgreSQL is accessible
- Check disk space in backup directory
- Review logs: `/var/log/jarvis/backup.log`

**Restore Fails:**
- Verify backup file integrity (checksum)
- Check database connection
- Ensure sufficient disk space
- Review PostgreSQL logs

**Backups Not Running:**
- Verify cron job is configured: `crontab -l`
- Check cron logs: `/var/log/jarvis/backup-cron.log`
- Ensure scripts are executable: `chmod +x scripts/*.sh`

## Configuration

### Environment Variables

- `BACKUP_DIR` - Backup storage directory (default: `/var/backups/jarvis`)
- `BACKUP_RETENTION_DAYS` - Days to keep backups (default: `30`)
- `DATABASE_URL` - PostgreSQL connection string

### Cron Configuration

See `scripts/backup-cron.txt` for cron job examples.

## Related Files

- `src/services/backupService.ts` - Backup service implementation
- `scripts/backup-db.sh` - Backup shell script
- `scripts/restore-db.sh` - Restore shell script
- `src/scripts/create-backup.ts` - Node.js backup script
- `src/scripts/list-backups.ts` - List backups script
- `src/scripts/cleanup-backups.ts` - Cleanup script
