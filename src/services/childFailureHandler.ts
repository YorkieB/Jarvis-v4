/**
 * Child Agent Failure Handler
 * Detects and recovers from child agent failures
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AgentManagerService } from './agentManagerService';
import { TaskQueueService } from './taskQueueService';
import { FailureType, RecoveryMethod } from '../types/agentTypes';

export class ChildFailureHandler {
  private prisma: PrismaClient;
  private agentManager: AgentManagerService;
  private taskQueue: TaskQueueService;

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
   * Record an agent failure
   */
  async recordFailure(
    agentId: string,
    failureType: FailureType,
    failureReason?: string,
    detectedBy?: string,
  ): Promise<string> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Get affected tasks
      const affectedTasks = await this.taskQueue.getTasks({
        assignedAgentId: agentId,
        status: 'in_progress',
      });

      const failure = await this.prisma.agentFailure.create({
        data: {
          agentId,
          parentId: agent.parentId || null,
          failureType,
          failureReason: failureReason || null,
          tasksAffected: affectedTasks.map((t) => t.id),
          detectedBy: detectedBy || null,
          recovered: false,
        },
      });

      // Update agent status
      await this.agentManager.updateAgentStatus(agentId, 'error');

      // Decrease health score
      const currentHealth = agent.healthScore;
      const newHealth = Math.max(0, currentHealth - 20);
      await this.agentManager.updateHealthScore(agentId, newHealth);

      logger.error('Agent failure recorded', {
        failureId: failure.id,
        agentId,
        failureType,
        affectedTasks: affectedTasks.length,
      });

      // Attempt automatic recovery
      await this.attemptRecovery(failure.id, agentId, failureType);

      return failure.id;
    } catch (error) {
      logger.error('Failed to record agent failure', { error, agentId });
      throw error;
    }
  }

  /**
   * Attempt automatic recovery from failure
   */
  private async attemptRecovery(
    failureId: string,
    agentId: string,
    failureType: FailureType,
  ): Promise<void> {
    try {
      let recoveryMethod: RecoveryMethod | null = null;

      // Determine recovery strategy based on failure type
      switch (failureType) {
        case 'crash':
        case 'error':
          recoveryMethod = 'restart';
          break;
        case 'timeout':
        case 'unresponsive':
          recoveryMethod = 'restart';
          break;
        case 'logic_error':
          recoveryMethod = 'replace';
          break;
        default:
          recoveryMethod = 'restart';
      }

      if (!recoveryMethod) {
        logger.warn('No recovery method determined', {
          failureId,
          failureType,
        });
        return;
      }

      const startTime = Date.now();
      let recovered = false;

      switch (recoveryMethod) {
        case 'restart':
          recovered = await this.restartAgent(agentId);
          break;
        case 'replace':
          recovered = await this.replaceAgent(agentId);
          break;
        default:
          logger.warn('Recovery method not implemented', { recoveryMethod });
          return;
      }

      if (recovered) {
        const recoveryTime = Date.now() - startTime;
        await this.prisma.agentFailure.update({
          where: { id: failureId },
          data: {
            recovered: true,
            recoveryTime: new Date(),
            recoveryMethod,
          },
        });

        logger.info('Agent recovery successful', {
          failureId,
          agentId,
          recoveryMethod,
          recoveryTimeMs: recoveryTime,
        });
      } else {
        logger.error('Agent recovery failed', {
          failureId,
          agentId,
          recoveryMethod,
        });
      }
    } catch (error) {
      logger.error('Recovery attempt failed', { error, failureId, agentId });
    }
  }

  /**
   * Restart an agent
   */
  private async restartAgent(agentId: string): Promise<boolean> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        return false;
      }

      // Reassign tasks to other agents
      await this.reassignTasks(agentId);

      // Update agent status to idle
      await this.agentManager.updateAgentStatus(agentId, 'idle', 0);

      // Increase health score slightly (recovery attempt)
      const currentHealth = agent.healthScore;
      await this.agentManager.updateHealthScore(agentId, currentHealth + 10);

      logger.info('Agent restarted', { agentId });
      return true;
    } catch (error) {
      logger.error('Failed to restart agent', { error, agentId });
      return false;
    }
  }

  /**
   * Replace an agent with a new one
   */
  private async replaceAgent(agentId: string): Promise<boolean> {
    try {
      const agent = await this.agentManager.getAgent(agentId);
      if (!agent || !agent.parentId) {
        return false;
      }

      // Reassign tasks
      await this.reassignTasks(agentId);

      // Spawn replacement agent
      const newAgentId = await this.agentManager.spawnChildAgent(
        agent.parentId,
        agent.agentType,
      );

      // Stop old agent
      await this.agentManager.removeAgent(agentId);

      logger.info('Agent replaced', {
        oldAgentId: agentId,
        newAgentId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to replace agent', { error, agentId });
      return false;
    }
  }

  /**
   * Reassign tasks from a failed agent
   */
  private async reassignTasks(failedAgentId: string): Promise<void> {
    try {
      const affectedTasks = await this.taskQueue.getTasks({
        assignedAgentId: failedAgentId,
        status: 'in_progress',
      });

      if (affectedTasks.length === 0) {
        return;
      }

      const agent = await this.agentManager.getAgent(failedAgentId);
      if (!agent) {
        return;
      }

      // Find available agents with same capabilities
      const availableAgents = await this.agentManager.findAvailableAgents(
        agent.capabilities,
        [failedAgentId],
      );

      // Reassign tasks
      for (let i = 0; i < affectedTasks.length; i++) {
        const task = affectedTasks[i];
        if (i < availableAgents.length) {
          // Reassign to available agent
          await this.taskQueue.assignTask(task.id, availableAgents[i].id);
        } else {
          // Retry task (will be picked up by next available agent)
          await this.taskQueue.retryTask(task.id);
        }
      }

      logger.info('Tasks reassigned', {
        failedAgentId,
        taskCount: affectedTasks.length,
        reassignedTo: availableAgents.length,
      });
    } catch (error) {
      logger.error('Failed to reassign tasks', { error, failedAgentId });
    }
  }

  /**
   * Get failure statistics
   */
  async getFailureStats(agentId?: string) {
    const failures = await this.prisma.agentFailure.findMany({
      where: agentId ? { agentId } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: failures.length,
      recovered: failures.filter((f) => f.recovered).length,
      unrecovered: failures.filter((f) => !f.recovered).length,
      byType: {} as Record<string, number>,
      byRecoveryMethod: {} as Record<string, number>,
      averageRecoveryTime: 0,
    };

    let totalRecoveryTime = 0;
    let recoveryCount = 0;

    for (const failure of failures) {
      stats.byType[failure.failureType] =
        (stats.byType[failure.failureType] || 0) + 1;

      if (failure.recovered && failure.recoveryTime && failure.recoveryMethod) {
        stats.byRecoveryMethod[failure.recoveryMethod] =
          (stats.byRecoveryMethod[failure.recoveryMethod] || 0) + 1;

        const recoveryTime =
          failure.recoveryTime.getTime() - failure.createdAt.getTime();
        totalRecoveryTime += recoveryTime;
        recoveryCount++;
      }
    }

    if (recoveryCount > 0) {
      stats.averageRecoveryTime = totalRecoveryTime / recoveryCount;
    }

    return stats;
  }
}
