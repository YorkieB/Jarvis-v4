#!/bin/bash
# Database Restore Script for Jarvis v4
# Restores database from a backup file

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jarvis}"
DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/jarvis}"
LOG_FILE="${LOG_FILE:-/var/log/jarvis/restore.log}"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/jarvis-backup-*.sql.gz 2>/dev/null | awk '{print $9, "(" $5 ")"}'
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify checksum if available
if [ -f "$BACKUP_FILE.sha256" ]; then
    EXPECTED_CHECKSUM=$(cat "$BACKUP_FILE.sha256")
    ACTUAL_CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
    
    if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
        log "ERROR: Backup checksum mismatch!"
        log "Expected: $EXPECTED_CHECKSUM"
        log "Actual:   $ACTUAL_CHECKSUM"
        exit 1
    fi
    log "Checksum verified: OK"
fi

# Parse DATABASE_URL
if [[ -z "$DATABASE_URL" ]]; then
    log "ERROR: DATABASE_URL not set"
    exit 1
fi

DB_URL_REGEX="postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+)"
if [[ $DATABASE_URL =~ $DB_URL_REGEX ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
else
    log "ERROR: Invalid DATABASE_URL format"
    exit 1
fi

# Safety confirmation
echo ""
echo "WARNING: This will overwrite the database '$DB_NAME' on '$DB_HOST'!"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

log "Starting database restore from: $BACKUP_FILE"

# Set PGPASSWORD
export PGPASSWORD="$DB_PASSWORD"

# Restore database
if gunzip -c "$BACKUP_FILE" | pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists; then
    log "Database restore completed successfully"
    exit 0
else
    log "ERROR: Database restore failed"
    exit 1
fi
