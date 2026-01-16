/**
 * Mutual Monitoring Service
 * Enables agents to monitor each other for redundancy
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AgentManagerService } from './agentManagerService';
import { ChildFailureHandler } from './childFailureHandler';
import { AgentCommunicationService } from './agentCommunicationService';

export interface MonitoringPair {
  agentId: string;
  monitoredBy: string[];
  monitors: string[];
}

export class MutualMonitoringService {
  private prisma: PrismaClient;
  private agentManager: AgentManagerService;
  private failureHandler: ChildFailureHandler;
  private communication: AgentCommunicationService;
  private monitoringPairs: Map<string, MonitoringPair> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

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
   * Start mutual monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('Mutual monitoring already started');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      void this.checkMonitoringPairs();
    }, intervalMs);

    logger.info('Mutual monitoring started', { intervalMs });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Mutual monitoring stopped');
    }
  }

  /**
   * Set up mutual monitoring between two agents
   */
  async setupMutualMonitoring(agentId1: string, agentId2: string): Promise<void> {
    try {
      // Update database relationships
      await this.prisma.agent.update({
        where: { id: agentId1 },
        data: {
          monitors: {
            connect: { id: agentId2 },
          },
        },
      });

      await this.prisma.agent.update({
        where: { id: agentId2 },
        data: {
          monitors: {
            connect: { id: agentId1 },
          },
        },
      });

      // Update local cache
      this.updateMonitoringPair(agentId1, agentId2);
      this.updateMonitoringPair(agentId2, agentId1);

      logger.info('Mutual monitoring setup', { agentId1, agentId2 });
    } catch (error) {
      logger.error('Failed to setup mutual monitoring', {
        error,
        agentId1,
        agentId2,
      });
      throw error;
    }
  }

  /**
   * Remove mutual monitoring
   */
  async removeMutualMonitoring(agentId1: string, agentId2: string): Promise<void> {
    try {
      await this.prisma.agent.update({
        where: { id: agentId1 },
        data: {
          monitors: {
            disconnect: { id: agentId2 },
          },
        },
      });

      await this.prisma.agent.update({
        where: { id: agentId2 },
        data: {
          monitors: {
            disconnect: { id: agentId1 },
          },
        },
      });

      logger.info('Mutual monitoring removed', { agentId1, agentId2 });
    } catch (error) {
      logger.error('Failed to remove mutual monitoring', {
        error,
        agentId1,
        agentId2,
      });
    }
  }

  /**
   * Check all monitoring pairs
   */
  private async checkMonitoringPairs(): Promise<void> {
    try {
      const agents = await this.prisma.agent.findMany({
        where: {
          status: { not: 'stopped' },
        },
        include: {
          monitors: true,
        },
      });

      for (const agent of agents) {
        if (agent.monitors.length === 0) {
          continue;
        }

        // Check if agent is healthy
        const isHealthy = await this.checkAgentHealth(agent.id);

        if (!isHealthy) {
          // Notify monitoring agents
          for (const monitor of agent.monitors) {
            await this.notifyMonitor(monitor.id, agent.id);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check monitoring pairs', { error });
    }
  }

  /**
   * Check if an agent is healthy
   */
  private async checkAgentHealth(agentId: string): Promise<boolean> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        return false;
      }

      // Check status
      if (agent.status === 'error' || agent.status === 'stopped') {
        return false;
      }

      // Check health score
      if (agent.healthScore < 30) {
        return false;
      }

      // Check last heartbeat
      if (agent.lastHeartbeat) {
        const timeSinceHeartbeat =
          Date.now() - agent.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > 120000) {
          // 2 minutes
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check agent health', { error, agentId });
      return false;
    }
  }

  /**
   * Notify a monitoring agent about a failure
   */
  private async notifyMonitor(
    monitorId: string,
    failedAgentId: string,
  ): Promise<void> {
    try {
      this.communication.sendMessage(
        'mutual-monitoring-service',
        monitorId,
        'agent_failure_detected',
        {
          failedAgentId,
          timestamp: Date.now(),
        },
      );

      logger.info('Monitor notified of agent failure', {
        monitorId,
        failedAgentId,
      });
    } catch (error) {
      logger.error('Failed to notify monitor', { error, monitorId, failedAgentId });
    }
  }

  /**
   * Update monitoring pair in local cache
   */
  private updateMonitoringPair(agentId: string, monitoredBy: string): void {
    const pair = this.monitoringPairs.get(agentId) || {
      agentId,
      monitoredBy: [],
      monitors: [],
    };

    if (!pair.monitoredBy.includes(monitoredBy)) {
      pair.monitoredBy.push(monitoredBy);
    }

    this.monitoringPairs.set(agentId, pair);
  }

  /**
   * Get monitoring pairs
   */
  async getMonitoringPairs(): Promise<MonitoringPair[]> {
    const agents = await this.prisma.agent.findMany({
      include: {
        monitors: {
          select: { id: true, agentType: true },
        },
        monitoredBy: {
          select: { id: true, agentType: true },
        },
      },
    });

    return agents.map((agent) => ({
      agentId: agent.id,
      monitoredBy: agent.monitoredBy.map((m) => m.id),
      monitors: agent.monitors.map((m) => m.id),
    }));
  }

  /**
   * Auto-setup mutual monitoring for agents of the same type
   */
  async autoSetupMutualMonitoring(): Promise<void> {
    try {
      const agents = await this.prisma.agent.findMany({
        where: {
          status: { not: 'stopped' },
        },
      });

      // Group by agent type
      const agentsByType = new Map<string, typeof agents>();
      for (const agent of agents) {
        if (!agentsByType.has(agent.agentType)) {
          agentsByType.set(agent.agentType, []);
        }
        agentsByType.get(agent.agentType)!.push(agent);
      }

      // Setup mutual monitoring for agents of the same type (if multiple exist)
      for (const [agentType, typeAgents] of agentsByType) {
        if (typeAgents.length >= 2) {
          // Pair up agents
          for (let i = 0; i < typeAgents.length - 1; i++) {
            await this.setupMutualMonitoring(
              typeAgents[i].id,
              typeAgents[i + 1].id,
            );
          }
        }
      }

      logger.info('Auto-setup mutual monitoring completed');
    } catch (error) {
      logger.error('Failed to auto-setup mutual monitoring', { error });
    }
  }
}
