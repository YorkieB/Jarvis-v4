// Load environment variables FIRST - before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';

// Explicitly configure dotenv with path resolution
// In production, __dirname will be 'dist/', so '../.env' resolves to project root
// This works for both compiled (dist/index.js) and source (src/index.ts) contexts
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate critical environment variables
const requiredEnvVars = ['SENTRY_DSN', 'OPENAI_API_KEY', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('⚠️  Some features may not work correctly');
}

/**
 * Jarvis v4 - Entry Point
 *
 * Multi-Agent AI Assistant System with Enterprise Monitoring
 * 29 Specialized Agents
 *
 * ⚠️ All agents MUST read AI_RULES_MANDATORY.md before starting
 */

// CRITICAL: Initialize Sentry FIRST to capture boot-time errors
import { initSentry } from './sentry';
initSentry();

// Import monitoring and utilities
import logger from './utils/logger';
import { PrismaClient } from '@prisma/client';
import {
  errorHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} from './middleware/errorHandler';
import express from 'express';
import { createServer } from 'http';
import AudioStreamingService from './services/audioService';
import { createHealthRouter } from './health';
// Set up global error handlers
handleUncaughtException();
handleUnhandledRejection();

const prisma = new PrismaClient();

async function verifyDatabaseSchema(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "KnowledgeBase" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "Conversation" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "Message" LIMIT 1`;
    logger.info('✅ Database schema check passed');
  } catch (error) {
    logger.error('Database schema check failed', { error });
    logger.warn('⚠️  Run `npm run db:push` to create tables');
  }
}

void verifyDatabaseSchema();

// Log startup
logger.info('🚀 Starting Jarvis v4...');
logger.warn('⚠️  AI Rules Enforcement: ACTIVE');
logger.info('📋 All agents must acknowledge AI_RULES_MANDATORY.md on startup');

// Initialize Express app
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
import * as fs from 'fs';

// Resolve public directory path (works for both dev and production)
const publicPath = path.resolve(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  logger.info('✅ Static files served from public directory');
  
  // Serve index.html for root route
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  logger.warn('⚠️  Public directory not found, static file serving disabled');
}

// Register health check endpoints
app.use(createHealthRouter());
logger.info('✅ Health endpoints registered at /health and /health/ready');

// Import services for API endpoints
import VoiceAuthService from './services/voiceAuthService';
import BackupService from './services/backupService';

const voiceAuth = new VoiceAuthService(prisma);
const backupService = new BackupService(prisma);

// Sentry test endpoint
app.get('/debug-sentry', function mainHandler(_req, _res) {
  throw new Error('My first Sentry error!');
});

// Voice enrollment endpoint

app.post('/api/voice/enroll', async (req: express.Request, res: express.Response) => {
  try {
    const { userId, audioSamples } = req.body;

    if (!userId || !audioSamples || !Array.isArray(audioSamples)) {
      return res.status(400).json({
        error: 'Missing required fields: userId and audioSamples (array)',
      });
    }

    // Convert base64 audio samples to buffers
    const audioBuffers = audioSamples.map((sample: string) =>
      Buffer.from(sample, 'base64'),
    );

    await voiceAuth.enrollVoiceprint(userId, audioBuffers);

    res.json({
      success: true,
      message: 'Voiceprint enrolled successfully',
    });
  } catch (error) {
    logger.error('Voice enrollment failed', { error });
    res.status(500).json({
      error: 'Voice enrollment failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Voice verification status endpoint
app.get('/api/voice/status/:userId', async (req: express.Request, res: express.Response) => {
  try {
    const { userId } = req.params;
    const hasVoiceprint = await voiceAuth.hasVoiceprint(userId);

    res.json({
      hasVoiceprint,
      userId,
    });
  } catch (error) {
    logger.error('Failed to check voice status', { error });
    res.status(500).json({
      error: 'Failed to check voice status',
    });
  }
});

// Backup endpoints

app.post('/api/backup/create', async (_req: express.Request, res: express.Response) => {
  try {
    const backupPath = await backupService.createBackup();
    res.json({
      success: true,
      path: backupPath,
      message: 'Backup created successfully',
    });
  } catch (error) {
    logger.error('Backup creation failed', { error });
    res.status(500).json({
      error: 'Backup creation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/backup/list', async (_req: express.Request, res: express.Response) => {
  try {
    const backups = await backupService.listBackups();
    res.json({
      backups,
      count: backups.length,
    });
  } catch (error) {
    logger.error('Failed to list backups', { error });
    res.status(500).json({
      error: 'Failed to list backups',
    });
  }
});

// TODO: Initialize orchestrator and all agents
logger.info('✅ Jarvis v4 foundation ready');
logger.info('🔄 Agent implementation coming in subsequent PRs');

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server for Socket.IO integration
const server = createServer(app);

// Handle server errors
server.on('error', (error: Error) => {
  logger.error('Server error:', { error });
  process.exit(1);
});

// Start server first - health endpoints are already registered
// Note: Omitting hostname defaults to listening on all interfaces (0.0.0.0)
server.listen(PORT, () => {
  logger.info(`🎉 Jarvis v4 server listening on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);

  // Initialize Audio Streaming Service after server is listening
  try {
    new AudioStreamingService(server, prisma);
    logger.info('🎤 Audio Streaming Service initialized');
    logger.info(`🚀 Ready for voice agent implementation`);
  } catch (error) {
    logger.error('Failed to initialize Audio Streaming Service', { error });
    logger.warn('⚠️  Audio streaming will be unavailable');
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('👋 SIGINT signal received: closing HTTP server');
  process.exit(0);
});
