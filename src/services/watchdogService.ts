/**
 * Watchdog Service
 * Monitors critical agents (especially self-healing agent) and triggers recovery
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AgentManagerService } from './agentManagerService';
import { ChildFailureHandler } from './childFailureHandler';
import { AgentCommunicationService } from './agentCommunicationService';

export class WatchdogService {
  private prisma: PrismaClient;
  private agentManager: AgentManagerService;
  private failureHandler: ChildFailureHandler;
  private communication: AgentCommunicationService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly criticalAgents = ['self-healing-agent', 'orchestrator'];
  private readonly heartbeatTimeout = 60000; // 60 seconds

  constructor(
    prisma: PrismaClient,
    agentManager: AgentManagerService,
    failureHandler: ChildFailureHandler,
    communication: AgentCommunicationService,
  ) {
    this.prisma = prisma;
    this.agentManager = agentManager;
    this.failureHandler = failureHandler;
    this.communication = communication;
  }

  /**
   * Start monitoring critical agents
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('Watchdog monitoring already started');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      void this.checkCriticalAgents();
    }, intervalMs);

    logger.info('Watchdog monitoring started', {
      intervalMs,
      criticalAgents: this.criticalAgents,
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Watchdog monitoring stopped');
    }
  }

  /**
   * Check critical agents for failures
   */
  private async checkCriticalAgents(): Promise<void> {
    try {
      for (const agentType of this.criticalAgents) {
        await this.checkAgent(agentType);
      }
    } catch (error) {
      logger.error('Failed to check critical agents', { error });
    }
  }

  /**
   * Check a specific agent
   */
  private async checkAgent(agentType: string): Promise<void> {
    try {
      const agents = await this.prisma.agent.findMany({
        where: {
          agentType,
          status: { not: 'stopped' },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (agents.length === 0) {
        logger.warn('Critical agent not found', { agentType });
        return;
      }

      const agent = agents[0];

      // Check if agent is responsive
      const isResponsive = await this.checkAgentResponsiveness(agent.id);

      if (!isResponsive) {
        logger.error('Critical agent unresponsive', {
          agentId: agent.id,
          agentType,
        });

        // Record failure
        await this.failureHandler.recordFailure(
          agent.id,
          'unresponsive',
          'Agent failed to respond to watchdog heartbeat',
          'watchdog-service',
        );

        // Attempt recovery
        await this.recoverCriticalAgent(agent.id, agentType);
      } else {
        // Update heartbeat
        await this.agentManager.updateAgentStatus(
          agent.id,
          agent.status as any,
          agent.currentWorkload,
        );
      }
    } catch (error) {
      logger.error('Failed to check agent', { error, agentType });
    }
  }

  /**
   * Check if agent is responsive
   */
  private async checkAgentResponsiveness(agentId: string): Promise<boolean> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        return false;
      }

      // Check last heartbeat
      if (!agent.lastHeartbeat) {
        return false;
      }

      const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > this.heartbeatTimeout) {
        return false;
      }

      // Check health score
      if (agent.healthScore < 30) {
        return false;
      }

      // Send heartbeat request via message bus
      const response = await this.communication.requestResponse(
        'watchdog-service',
        agentId,
        'heartbeat',
        { timestamp: Date.now() },
        2000, // 2 second timeout
      );

      return response !== null;
    } catch (error) {
      logger.error('Failed to check agent responsiveness', { error, agentId });
      return false;
    }
  }

  /**
   * Recover a critical agent
   */
  private async recoverCriticalAgent(
    agentId: string,
    agentType: string,
  ): Promise<void> {
    try {
      logger.warn('Attempting to recover critical agent', {
        agentId,
        agentType,
      });

      // For self-healing agent, we need special handling
      if (agentType === 'self-healing-agent') {
        await this.recoverSelfHealingAgent(agentId);
      } else {
        // Standard recovery: restart
        await this.failureHandler['restartAgent'](agentId);
      }
    } catch (error) {
      logger.error('Failed to recover critical agent', {
        error,
        agentId,
        agentType,
      });
    }
  }

  /**
   * Recover self-healing agent (special case)
   */
  private async recoverSelfHealingAgent(agentId: string): Promise<void> {
    try {
      logger.error('CRITICAL: Self-healing agent failure detected', {
        agentId,
      });

      // Broadcast emergency alert
      this.communication.broadcastMessage('watchdog-service', 'emergency', {
        type: 'self-healing-agent-failure',
        agentId,
        timestamp: Date.now(),
      });

      // Attempt restart
      const agent = await this.agentManager.getAgent(agentId);
      if (agent && agent.parentId) {
        // Try to restart via parent
        await this.agentManager.updateAgentStatus(agentId, 'idle', 0);
        await this.agentManager.updateHealthScore(agentId, 50);

        logger.warn('Self-healing agent recovery attempted', { agentId });
      } else {
        // Last resort: manual intervention required
        logger.error(
          'CRITICAL: Manual intervention required for self-healing agent',
          {
            agentId,
          },
        );
      }
    } catch (error) {
      logger.error('Failed to recover self-healing agent', { error, agentId });
    }
  }

  /**
   * Register an agent as critical
   */
  registerCriticalAgent(agentType: string): void {
    if (!this.criticalAgents.includes(agentType)) {
      this.criticalAgents.push(agentType);
      logger.info('Agent registered as critical', { agentType });
    }
  }
}
