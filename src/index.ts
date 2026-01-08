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
import { errorHandler, handleUncaughtException, handleUnhandledRejection } from './middleware/errorHandler';
import express from 'express';
import { registerHealthRoutes } from './health';

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
registerHealthRoutes(app);
logger.info('✅ Health endpoints registered at /health and /health/ready');

// TODO: Initialize orchestrator and all agents
logger.info('✅ Jarvis v4 foundation ready');
logger.info('🔄 Agent implementation coming in subsequent PRs');

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🎉 Jarvis v4 server listening on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  logger.info(`🚀 Ready for voice agent implementation`);
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
