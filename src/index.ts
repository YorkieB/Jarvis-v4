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

// Log startup
logger.info('🚀 Starting Jarvis v4...');
logger.warn('⚠️  AI Rules Enforcement: ACTIVE');
logger.info('📋 All agents must acknowledge AI_RULES_MANDATORY.md on startup');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register health check endpoints
app.use(createHealthRouter());
logger.info('✅ Health endpoints registered at /health and /health/ready');

// Sentry test endpoint
app.get('/debug-sentry', function mainHandler(_req, _res) {
  throw new Error('My first Sentry error!');
});

// TODO: Initialize orchestrator and all agents
logger.info('✅ Jarvis v4 foundation ready');
logger.info('🔄 Agent implementation coming in subsequent PRs');

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server for Socket.IO integration
const server = createServer(app);

// Start server first - health endpoints are already registered
server.listen(PORT, () => {
  logger.info(`🎉 Jarvis v4 server listening on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);

  // Initialize Audio Streaming Service after server is listening
  try {
    new AudioStreamingService(server);
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
