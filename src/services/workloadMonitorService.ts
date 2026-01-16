/**
 * Workload Monitor Service
 * Tracks agent capacity and triggers delegation when needed
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AgentManagerService } from './agentManagerService';
import { TaskQueueService } from './taskQueueService';

export interface WorkloadThresholds {
  high: number; // Percentage (0-100)
  critical: number; // Percentage (0-100)
}

export class WorkloadMonitorService {
  private prisma: PrismaClient;
  private agentManager: AgentManagerService;
  private taskQueue: TaskQueueService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly thresholds: WorkloadThresholds = {
    high: 75,
    critical: 90,
  };

  constructor(
    prisma: PrismaClient,
    agentManager: AgentManagerService,
    taskQueue: TaskQueueService,
  ) {
    this.prisma = prisma;
    this.agentManager = agentManager;
    this.taskQueue = taskQueue;
  }

  /**
   * Start monitoring agent workloads
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('Workload monitoring already started');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      void this.checkWorkloads();
    }, intervalMs);

    logger.info('Workload monitoring started', { intervalMs });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Workload monitoring stopped');
    }
  }

  /**
   * Check workloads and trigger delegation if needed
   */
  private async checkWorkloads(): Promise<void> {
    try {
      const agents = await this.prisma.agent.findMany({
        where: {
          status: { in: ['idle', 'busy'] },
        },
      });

      for (const agent of agents) {
        const workloadPercentage =
          (agent.currentWorkload / agent.maxConcurrentTasks) * 100;

        if (workloadPercentage >= this.thresholds.critical) {
          logger.warn('Agent at critical workload', {
            agentId: agent.id,
            agentType: agent.agentType,
            workload: agent.currentWorkload,
            max: agent.maxConcurrentTasks,
            percentage: workloadPercentage.toFixed(2),
          });

          // Trigger delegation
          await this.triggerDelegation(agent.id);
        } else if (workloadPercentage >= this.thresholds.high) {
          logger.info('Agent at high workload', {
            agentId: agent.id,
            agentType: agent.agentType,
            workload: agent.currentWorkload,
            max: agent.maxConcurrentTasks,
            percentage: workloadPercentage.toFixed(2),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check workloads', { error });
    }
  }

  /**
   * Trigger delegation for an overloaded agent
   */
  private async triggerDelegation(agentId: string): Promise<void> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        return;
      }

      // Find pending tasks assigned to this agent
      const pendingTasks = await this.taskQueue.getTasks({
        assignedAgentId: agentId,
        status: 'pending',
      });

      if (pendingTasks.length === 0) {
        return;
      }

      // Try to find available child agents or spawn new ones
      const availableAgents = await this.agentManager.findAvailableAgents(
        agent.capabilities,
        [agentId],
      );

      if (availableAgents.length === 0 && agent.parentId) {
        // Try to spawn a new child agent
        try {
          const childId = await this.agentManager.spawnChildAgent(
            agent.parentId,
            agent.agentType,
          );
          logger.info('Spawned child agent for delegation', {
            parentId: agentId,
            childId,
          });

          // Reassign tasks
          for (const task of pendingTasks.slice(0, 3)) {
            // Limit to 3 tasks to avoid overwhelming new agent
            await this.taskQueue.assignTask(task.id, childId);
          }
        } catch (error) {
          logger.error('Failed to spawn child agent for delegation', {
            error,
            agentId,
          });
        }
      } else if (availableAgents.length > 0) {
        // Reassign tasks to available agents
        for (let i = 0; i < Math.min(pendingTasks.length, availableAgents.length); i++) {
          await this.taskQueue.assignTask(
            pendingTasks[i].id,
            availableAgents[i].id,
          );
        }
      }
    } catch (error) {
      logger.error('Failed to trigger delegation', { error, agentId });
    }
  }

  /**
   * Get workload statistics
   */
  async getWorkloadStats() {
    const agents = await this.prisma.agent.findMany({
      where: {
        status: { in: ['idle', 'busy'] },
      },
    });

    const stats = {
      total: agents.length,
      idle: 0,
      busy: 0,
      highWorkload: 0,
      criticalWorkload: 0,
      averageWorkload: 0,
      totalCapacity: 0,
      totalUsed: 0,
    };

    let totalCapacity = 0;
    let totalUsed = 0;

    for (const agent of agents) {
      const workloadPercentage =
        (agent.currentWorkload / agent.maxConcurrentTasks) * 100;

      if (agent.status === 'idle') {
        stats.idle++;
      } else if (agent.status === 'busy') {
        stats.busy++;
      }

      if (workloadPercentage >= this.thresholds.critical) {
        stats.criticalWorkload++;
      } else if (workloadPercentage >= this.thresholds.high) {
        stats.highWorkload++;
      }

      totalCapacity += agent.maxConcurrentTasks;
      totalUsed += agent.currentWorkload;
    }

    stats.totalCapacity = totalCapacity;
    stats.totalUsed = totalUsed;
    stats.averageWorkload =
      totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

    return stats;
  }

  /**
   * Set workload thresholds
   */
  setThresholds(thresholds: Partial<WorkloadThresholds>): void {
    if (thresholds.high !== undefined) {
      this.thresholds.high = Math.max(0, Math.min(100, thresholds.high));
    }
    if (thresholds.critical !== undefined) {
      this.thresholds.critical = Math.max(0, Math.min(100, thresholds.critical));
    }
    logger.info('Workload thresholds updated', { thresholds: this.thresholds });
  }
}
