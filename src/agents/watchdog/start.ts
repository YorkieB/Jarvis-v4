/**
 * Standalone entry point for Watchdog Agent
 * Can be run as a separate PM2 process
 */

import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { WatchdogAgent } from './index';
import logger from '../../utils/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

logger.info('🐕 Starting Watchdog Agent...');
const agent = new WatchdogAgent();

setImmediate(() => {
  void agent
    .startMonitoring(30000) // 30 second intervals
    .then(() => {
      logger.info('✅ Watchdog Agent started successfully');
    })
    .catch((error) => {
      logger.error('Failed to start Watchdog Agent', { error });
      process.exit(1);
    });
});

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received, shutting down Watchdog Agent');
  agent.stopMonitoring();
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('👋 SIGINT received, shutting down Watchdog Agent');
  agent.stopMonitoring();
  process.exit(0);
});
