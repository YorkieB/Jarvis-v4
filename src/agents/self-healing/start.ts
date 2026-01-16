/**
 * Standalone entry point for Self-Healing Agent
 * Can be run as a separate PM2 process
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { SelfHealingAgent } from './index';
import logger from '../../utils/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  logger.info('🔧 Starting Self-Healing Agent...');

  try {
    const agent = new SelfHealingAgent();
    await agent.startMonitoring();
    logger.info('✅ Self-Healing Agent started successfully');

    // Keep process alive
    process.on('SIGTERM', () => {
      logger.info('👋 SIGTERM received, shutting down Self-Healing Agent');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('👋 SIGINT received, shutting down Self-Healing Agent');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start Self-Healing Agent', { error });
    process.exit(1);
  }
}

void main();
