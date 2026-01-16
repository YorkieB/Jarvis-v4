/**
 * Watchdog Agent
 * Monitors critical agents, especially the self-healing agent
 */

import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';
import { AgentManagerService } from '../../services/agentManagerService';
import { TaskQueueService } from '../../services/taskQueueService';
import { ChildFailureHandler } from '../../services/childFailureHandler';
import { AgentCommunicationService } from '../../services/agentCommunicationService';
import { WatchdogService } from '../../services/watchdogService';

export class WatchdogAgent extends BaseAgent {
  protected agentType = 'watchdog';
  protected permissions = ['read:*', 'write:agents', 'read:tasks'];

  private prisma: PrismaClient;
  private watchdogService: WatchdogService;
  private communication: AgentCommunicationService;

  constructor(prisma?: PrismaClient) {
    super();
    this.prisma = prisma || new PrismaClient();

    // Initialize services
    const agentManager = new AgentManagerService(this.prisma);
    const taskQueue = new TaskQueueService(this.prisma, agentManager);
    const failureHandler = new ChildFailureHandler(
      this.prisma,
      agentManager,
      taskQueue,
    );
    this.communication = new AgentCommunicationService();
    this.watchdogService = new WatchdogService(
      this.prisma,
      agentManager,
      failureHandler,
      this.communication,
    );

    // Subscribe to emergency messages
    this.communication.subscribeToType('emergency', (message) => {
      void this.handleEmergency(message);
    });
  }

  /**
   * Start watchdog monitoring
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    logger.info('🐕 Watchdog Agent starting monitoring');
    this.watchdogService.startMonitoring(intervalMs);

    // Send heartbeat
    setInterval(() => {
      void this.sendHeartbeat();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    logger.info('🐕 Watchdog Agent stopping monitoring');
    this.watchdogService.stopMonitoring();
  }

  /**
   * Send heartbeat to indicate this agent is alive
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      // Update last heartbeat in database
      const agents = await this.prisma.agent.findMany({
        where: { agentType: 'watchdog' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (agents.length > 0) {
        await this.prisma.agent.update({
          where: { id: agents[0].id },
          data: {
            lastHeartbeat: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      logger.error('Failed to send watchdog heartbeat', { error });
    }
  }

  /**
   * Handle emergency messages
   */
  private async handleEmergency(message: any): Promise<void> {
    logger.error('🚨 Emergency message received', { message });

    if (message.payload?.type === 'self-healing-agent-failure') {
      logger.error('🚨 CRITICAL: Self-healing agent failure detected');
      // Additional recovery logic can be added here
    }
  }

  /**
   * Get watchdog status
   */
  async getStatus() {
    const agents = await this.prisma.agent.findMany({
      where: { agentType: 'watchdog' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (agents.length === 0) {
      return { active: false };
    }

    return {
      active: true,
      agentId: agents[0].id,
      healthScore: agents[0].healthScore,
      lastHeartbeat: agents[0].lastHeartbeat,
    };
  }
}
