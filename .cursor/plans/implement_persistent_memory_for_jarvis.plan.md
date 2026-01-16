---
name: Implement Persistent Memory for Jarvis
overview: Implement database-backed persistent memory for Jarvis conversations, enabling conversation history to survive restarts and support multiple conversations per authenticated user.
todos:
  - id: update-dialogue-agent
    content: Update DialogueAgent to use Prisma for conversation persistence
    status: pending
  - id: add-conversation-methods
    content: Add conversation management methods (create, list, get, delete)
    status: pending
  - id: update-orchestrator
    content: Update Orchestrator to pass userId to DialogueAgent
    status: pending
  - id: add-error-handling
    content: Add error handling and fallback mechanisms
    status: pending
  - id: write-tests
    content: Write integration and unit tests for persistent memory
    status: pending
  - id: implement-backup-service
    content: Create backup service for database backups
    status: pending
  - id: add-backup-scripts
    content: Add backup and restore scripts
    status: pending
  - id: configure-backup-scheduling
    content: Configure automated backup scheduling
    status: pending
  - id: implement-voice-auth
    content: Implement voice-based authentication (voiceprint enrollment and verification)
    status: pending
  - id: add-voiceprint-schema
    content: Add Voiceprint model to Prisma schema
    status: pending
---

# Implement Persistent Memory for Jarvis

## Overview

Currently, Jarvis stores conversation history only in memory (`Map<string, ChatCompletionMessageParam[]>` in `DialogueAgent`), which is lost on restart. This plan implements persistent storage using the existing Prisma schema (`Conversation` and `Message` models) to enable long-term memory.

## Architecture Changes

### Current State

- `DialogueAgent` uses in-memory `Map` for conversation history
- Database schema exists but is not used
- No user authentication context
- Single conversation per sessionId

### Target State

- Conversations persisted to PostgreSQL via Prisma
- Conversation history loaded from database on session start
- Support for multiple conversations per authenticated user
- Backward compatible with in-memory cache for performance

## Implementation Plan

### 1. Update DialogueAgent Interface

**File**: `src/agents/dialogue/index.ts`

**Changes**:

- Add `userId: string` parameter to `generateResponse()` method
- Add `conversationId?: string` parameter to support multiple conversations
- Import `PrismaClient` and create instance
- Replace in-memory `Map` with database-backed storage
- Keep in-memory cache for active conversations (hybrid approach)

**Key Methods to Add**:

- `getOrCreateConversation(userId: string, conversationId?: string): Promise<string>` - Returns conversation ID
- `loadConversationHistory(conversationId: string): Promise<ChatCompletionMessageParam[]>` - Loads from DB
- `saveMessage(conversationId: string, role: string, content: string): Promise<void>` - Persists message
- `getUserConversations(userId: string): Promise<Conversation[]>` - Lists user's conversations

### 2. Database Integration

**File**: `src/agents/dialogue/index.ts`

**Implementation Details**:

- Initialize `PrismaClient` instance (reuse from `src/index.ts` or create new)
- On `generateResponse()`:
  1. Get or create `Conversation` record for userId
  2. Load existing messages from database if conversationId provided
  3. Append new user message to history
  4. Call LLM with full history
  5. Save both user and assistant messages to `Message` table
  6. Update conversation `updatedAt` timestamp

- Maintain in-memory cache for active conversations to reduce DB queries

### 3. User Authentication Context

**Files**: `src/orchestrator/index.ts`, `src/services/audioService.ts`, `src/agents/voice/index.ts`

**Changes**:

- Add userId extraction from request context (headers, tokens, or session)
- Pass userId to DialogueAgent methods
- Handle unauthenticated requests (return error or create anonymous user)

**Note**: Since authentication system doesn't exist yet, we'll:

- Add `userId` as optional parameter (default to anonymous)
- Create placeholder authentication middleware structure
- Document where real auth should be integrated

#### 3.1 Voice-Based Authentication (Voiceprint Recognition)

**Files**: `src/services/voiceAuthService.ts` (new), `src/agents/voice/index.ts`, `prisma/schema.prisma`

**Overview**: Implement voice biometrics so Jarvis only responds to the authorized user's voice. When someone else speaks, Jarvis will not respond.

**Implementation Approach**:

**Option A: Deepgram Speaker Diarization + Custom Verification** (Recommended)

- Use Deepgram's speaker diarization features (already integrated)
- Extract voice features/embeddings from audio samples
- Store voiceprint embeddings in database
- Compare incoming audio against stored voiceprint
- Threshold-based matching (e.g., 85% similarity required)

**Option B: Dedicated Voice Biometrics API**

- Use services like VoiceIt, Nuance, or Microsoft Speaker Recognition API
- More accurate but adds external dependency and cost
- Better for production-grade security

**Option C: ML-Based Voiceprint Model**

- Train/use pre-trained voiceprint model (e.g., SpeechBrain, wav2vec2)
- Extract embeddings using transformer models
- Store embeddings and use cosine similarity for matching
- Most control but requires ML expertise

**Recommended: Hybrid Approach**

- Use Deepgram for initial audio processing (already integrated)
- Extract voice features using lightweight ML model
- Store voiceprint embeddings in database
- Real-time verification during audio streaming

**Database Schema Addition**:

```prisma
model Voiceprint {
  id          String   @id @default(uuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id])
  embedding   Unsupported("vector(512)")  // Voiceprint embedding vector
  audioSample String?  // Path to enrollment audio sample (optional)
  enrolledAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt
  isActive    Boolean  @default(true)
  confidence  Float    @default(0.95)  // Minimum confidence threshold

  @@index([embedding(ops: raw("vector_cosine_ops"))])
}
```

**Voice Enrollment Flow**:

1. **Enrollment Endpoint**: `POST /api/voice/enroll`
   - User records 3-5 voice samples (10-30 seconds total)
   - System extracts voiceprint features from samples
   - Stores voiceprint embedding in database
   - Returns enrollment success/failure

2. **Enrollment Requirements**:
   - Minimum 10 seconds of audio
   - Multiple phrases for better accuracy
   - Background noise filtering
   - Sample quality validation

**Voice Verification Flow**:

1. **During Audio Stream** (`src/services/audioService.ts`):
   - Extract voice features from incoming audio chunks
   - Compare against stored voiceprint for authenticated user
   - If match confidence < threshold: reject and log unauthorized attempt
   - If match confidence >= threshold: proceed with conversation

2. **Verification Methods** (`src/services/voiceAuthService.ts`):
   - `enrollVoiceprint(userId: string, audioSamples: Buffer[]): Promise<void>` - Enroll user voice
   - `verifyVoice(userId: string, audioBuffer: Buffer): Promise<{verified: boolean, confidence: number}>` - Verify speaker
   - `updateVoiceprint(userId: string, audioSamples: Buffer[]): Promise<void>` - Re-enroll/update voiceprint
   - `deleteVoiceprint(userId: string): Promise<void>` - Remove voiceprint

**Integration Points**:

- **AudioService** (`src/services/audioService.ts`):
  - Add voice verification before processing conversation turn
  - Reject audio if voice doesn't match authorized user
  - Log unauthorized access attempts

- **VoiceAgent** (`src/agents/voice/index.ts`):
  - Add voiceprint extraction methods
  - Integrate with voice authentication service

- **Frontend** (`public/js/app.js`):
  - Add enrollment UI for voice setup
  - Show verification status during conversations
  - Handle rejection messages gracefully

**Security Considerations**:

- Voiceprints stored as encrypted embeddings (not raw audio)
- Minimum confidence threshold (configurable, default 85%)
- Rate limiting on verification attempts
- Audit logging of all verification attempts (success/failure)
- Option to disable voice auth for testing/development
- Fallback to traditional auth if voice verification fails

**Error Handling**:

- Handle cases where voiceprint not enrolled (prompt user to enroll)
- Handle poor audio quality (request re-recording)
- Handle background noise (filter or reject)
- Handle multiple speakers (reject if not primary user)

### 4. Conversation Management

**File**: `src/agents/dialogue/index.ts`

**New Methods**:

- `createConversation(userId: string, title?: string): Promise<string>` - Creates new conversation
- `listConversations(userId: string): Promise<Conversation[]>` - Lists all user conversations
- `getConversation(conversationId: string, userId: string): Promise<Conversation | null>` - Gets specific conversation
- `deleteConversation(conversationId: string, userId: string): Promise<void>` - Deletes conversation

### 5. Update Orchestrator Integration

**File**: `src/orchestrator/index.ts`

**Changes**:

- Extract userId from incoming messages (from auth token or session)
- Pass userId to DialogueAgent when routing conversation messages
- Add conversationId to message routing if provided

### 6. Error Handling & Edge Cases

**Considerations**:

- Handle database connection failures gracefully (fallback to in-memory)
- Handle missing conversations (create new)
- Handle concurrent writes (use transactions)
- Handle very long conversation histories (implement pagination/truncation)

### 7. Backup and Disaster Recovery

**Files**: `src/services/backupService.ts` (new), `scripts/backup-db.sh` (new), `scripts/restore-db.sh` (new)

**Implementation Details**:

#### 7.1 Database Backup Service

**File**: `src/services/backupService.ts`

**Features**:

- Automated PostgreSQL database backups using `pg_dump`
- Export conversations and messages to JSON format
- Compress backups (gzip)
- Timestamped backup files
- Backup verification (checksum validation)
- Configurable retention policy (keep last N backups)

**Key Methods**:

- `createBackup(): Promise<string>` - Creates full database backup, returns backup file path
- `exportConversations(userId?: string): Promise<string>` - Exports conversations to JSON
- `verifyBackup(backupPath: string): Promise<boolean>` - Validates backup integrity
- `listBackups(): Promise<string[]>` - Lists available backups
- `cleanupOldBackups(retentionDays: number): Promise<void>` - Removes old backups

#### 7.2 Backup Scripts

**File**: `scripts/backup-db.sh`

**Functionality**:

- Full PostgreSQL database dump
- Stores backups in `/var/backups/jarvis/` (or configurable path)
- Naming: `jarvis-backup-YYYYMMDD-HHMMSS.sql.gz`
- Logs backup operations
- Sends notifications on failure (optional)

**File**: `scripts/restore-db.sh`

**Functionality**:

- Restores database from backup file
- Pre-restore safety checks (confirmation prompt)
- Validates backup file before restore
- Creates restore log
- Option to restore to specific timestamp

#### 7.3 Automated Backup Scheduling

**Implementation Options**:

**Option A: Cron Job (Recommended for Linux)**

- Add cron entry: `0 2 * * * /path/to/scripts/backup-db.sh` (daily at 2 AM)
- Store cron config in `scripts/backup-cron.txt`

**Option B: Node.js Scheduler**

- Use `node-cron` package (add to dependencies)
- Schedule backups in `src/services/backupService.ts`
- Run as part of application startup

**Option C: PM2 Cron**

- Use PM2's built-in cron feature
- Configure in `ecosystem.config.cjs`

**Backup Schedule**:

- Daily full backups (keep 30 days)
- Weekly backups (keep 12 weeks)
- Monthly backups (keep 12 months)

#### 7.4 Backup Storage Strategy

**Local Storage**:

- Primary: `/var/backups/jarvis/` on server
- Retention: 30 days for daily backups

**Remote Storage** (Future Enhancement):

- Cloud storage (S3, DigitalOcean Spaces)
- Off-site backup server
- Encrypted backups for sensitive data

#### 7.5 Recovery Procedures

**File**: `docs/BACKUP_RECOVERY.md` (new)

**Documentation**:

- Step-by-step recovery guide
- Backup verification procedures
- Point-in-time recovery options
- Disaster recovery runbook

**Recovery Scenarios**:

1. **Server Crash**: Restore from latest backup
2. **Data Corruption**: Restore from verified backup
3. **Accidental Deletion**: Restore specific conversation/user data
4. **Database Migration Issues**: Rollback to previous backup

### 8. Testing

**Files**: `tests/integration/dialogue.test.ts` (new), `tests/unit/dialogue.test.ts` (new), `tests/integration/backup.test.ts` (new)

**Test Cases**:

- Create and persist conversation
- Load conversation history from database
- Multiple conversations per user
- Message persistence across restarts
- Error handling (DB unavailable)
- Conversation listing and retrieval
- Backup creation and verification
- Backup restore functionality
- Backup cleanup and retention

## Database Schema Usage

The existing schema supports this implementation:

```prisma
model Conversation {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages Message[]
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // 'user' or 'assistant'
  content        String
  timestamp      DateTime     @default(now())
}
```

## Migration Strategy

1. Keep in-memory cache as performance optimization
2. Write to database after each message exchange
3. Load from database on conversation start
4. Gradually migrate existing sessions (if any)

## Files to Modify

1. `src/agents/dialogue/index.ts` - Core implementation
2. `src/orchestrator/index.ts` - Pass userId to DialogueAgent
3. `src/services/audioService.ts` - Extract userId and add voice verification
4. `src/services/backupService.ts` - Backup service (new)
5. `src/services/voiceAuthService.ts` - Voice authentication service (new)
6. `src/agents/voice/index.ts` - Add voiceprint extraction methods
7. `prisma/schema.prisma` - Add Voiceprint model
8. `public/js/app.js` - Add voice enrollment UI
9. `scripts/backup-db.sh` - Database backup script (new)
10. `scripts/restore-db.sh` - Database restore script (new)
11. `scripts/backup-cron.txt` - Cron configuration (new)
12. `docs/BACKUP_RECOVERY.md` - Backup and recovery documentation (new)
13. `docs/VOICE_AUTHENTICATION.md` - Voice auth documentation (new)
14. `tests/integration/dialogue.test.ts` - Integration tests (new)
15. `tests/unit/dialogue.test.ts` - Unit tests (new)
16. `tests/integration/backup.test.ts` - Backup tests (new)
17. `tests/integration/voiceAuth.test.ts` - Voice auth tests (new)

## Dependencies

- `@prisma/client` - Already installed
- Database connection - Already configured in `src/index.ts`
- `node-cron` (optional) - For Node.js-based backup scheduling
- PostgreSQL `pg_dump` and `pg_restore` - Required for database backups (system-level)
- `@deepgram/sdk` - Already installed (for voice processing)
- `@tensorflow/tfjs-node` (optional) - For ML-based voiceprint extraction
- `speechbrain` or `wav2vec2` models (optional) - For voiceprint embeddings

## Success Criteria

- Conversations persist across server restarts
- Multiple conversations per user supported
- Conversation history loads from database
- Backward compatible with existing sessionId-based flow
- Error handling prevents data loss
- Tests verify persistence behavior
- Automated backups run on schedule
- Backups can be restored successfully
- Backup integrity verified
- Recovery procedures documented and tested
- Voice authentication enrolls user voiceprints successfully
- Jarvis only responds to authorized user's voice
- Unauthorized voice attempts are rejected and logged
- Voice verification has configurable confidence threshold
- Voice enrollment UI is user-friendly

## Backup Architecture

```
┌─────────────────┐
│  Application    │
│  (Jarvis v4)    │
└────────┬────────┘
         │
         │ Writes
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   Database      │
└────────┬────────┘
         │
         │ pg_dump
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Backup Service │─────▶│  Backup Storage  │
│  (Automated)    │      │  /var/backups/   │
└─────────────────┘      └──────────────────┘
         │
         │ (Future)
         ▼
┌─────────────────┐
│  Cloud Storage  │
│  (S3/Spaces)    │
└─────────────────┘
```

## Backup Retention Policy

- **Daily Backups**: Keep for 30 days
- **Weekly Backups**: Keep for 12 weeks (taken on Sundays)
- **Monthly Backups**: Keep for 12 months (taken on 1st of month)
- **On-Demand Backups**: Before major deployments or migrations
