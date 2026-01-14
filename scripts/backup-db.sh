#!/bin/bash
# Database Backup Script for Jarvis v4
# Creates a compressed PostgreSQL backup with timestamp

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jarvis}"
DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/jarvis}"
LOG_FILE="${LOG_FILE:-/var/log/jarvis/backup.log}"

# Create directories if they don't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting database backup..."

# Parse DATABASE_URL
if [[ -z "$DATABASE_URL" ]]; then
    log "ERROR: DATABASE_URL not set"
    exit 1
fi

# Extract connection details from DATABASE_URL
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

# Generate backup filename
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/jarvis-backup-$TIMESTAMP.sql.gz"

# Set PGPASSWORD for pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Create backup
log "Creating backup: $BACKUP_FILE"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"
    
    # Calculate checksum
    CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
    echo "$CHECKSUM" > "$BACKUP_FILE.sha256"
    log "Checksum: $CHECKSUM"
    
    exit 0
else
    log "ERROR: Backup failed"
    # Clean up partial backup
    [ -f "$BACKUP_FILE" ] && rm "$BACKUP_FILE"
    exit 1
fi
