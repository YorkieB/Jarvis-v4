/**
 * Standalone entry point for Watchdog Agent
 * Can be run as a separate PM2 process
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { WatchdogAgent } from './index';
import logger from '../../utils/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  logger.info('🐕 Starting Watchdog Agent...');
  try {
    const agent = new WatchdogAgent();
    await agent.startMonitoring(30000); // 30 second intervals
    logger.info('✅ Watchdog Agent started successfully');

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
  } catch (error) {
    logger.error('Failed to start Watchdog Agent', { error });
    process.exit(1);
  }
}

void main();
