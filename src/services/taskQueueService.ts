/**
 * Task Queue Service
 * Manages task distribution, tracking, and prioritization
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import {
  TaskPriority,
  TaskStatus,
  TaskPayload,
  TaskResult,
  TaskFilter,
} from '../types/taskTypes';
import { AgentManagerService } from './agentManagerService';

export class TaskQueueService {
  private prisma: PrismaClient;
  private agentManager: AgentManagerService;

  constructor(prisma: PrismaClient, agentManager: AgentManagerService) {
    this.prisma = prisma;
    this.agentManager = agentManager;
  }

  /**
   * Create a new task
   */
  async createTask(
    type: string,
    payload: TaskPayload,
    priority: TaskPriority = 'medium',
    parentTaskId?: string,
    timeoutMs?: number,
  ): Promise<string> {
    try {
      const task = await this.prisma.task.create({
        data: {
          type,
          payload,
          priority,
          parentTaskId,
          timeoutMs,
          status: 'pending',
        },
      });

      logger.info('Task created', {
        taskId: task.id,
        type,
        priority,
        parentTaskId,
      });

      return task.id;
    } catch (error) {
      logger.error('Failed to create task', { error, type });
      throw error;
    }
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(taskId: string, agentId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Update task
        await tx.task.update({
          where: { id: taskId },
          data: {
            assignedAgentId: agentId,
            status: 'assigned',
            startedAt: new Date(),
          },
        });

        // Update agent workload
        const agent = await tx.agent.findUnique({
          where: { id: agentId },
        });

        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        await tx.agent.update({
          where: { id: agentId },
          data: {
            currentWorkload: agent.currentWorkload + 1,
            status:
              agent.currentWorkload + 1 >= agent.maxConcurrentTasks
                ? 'busy'
                : 'busy',
            updatedAt: new Date(),
          },
        });
      });

      logger.info('Task assigned', { taskId, agentId });
    } catch (error) {
      logger.error('Failed to assign task', { error, taskId, agentId });
      throw error;
    }
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          include: { assignedAgent: true },
        });

        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Update task
        await tx.task.update({
          where: { id: taskId },
          data: {
            status: result.success ? 'completed' : 'failed',
            result: result.data
              ? (result.data as Record<string, unknown>)
              : null,
            error: result.error || null,
            completedAt: new Date(),
          },
        });

        // Update agent workload if assigned
        if (task.assignedAgentId && task.assignedAgent) {
          const newWorkload = Math.max(
            0,
            task.assignedAgent.currentWorkload - 1,
          );
          await tx.agent.update({
            where: { id: task.assignedAgentId },
            data: {
              currentWorkload: newWorkload,
              status: newWorkload === 0 ? 'idle' : 'busy',
              updatedAt: new Date(),
            },
          });
        }
      });

      logger.info('Task completed', {
        taskId,
        success: result.success,
      });
    } catch (error) {
      logger.error('Failed to complete task', { error, taskId });
      throw error;
    }
  }

  /**
   * Get next pending task for assignment
   */
  async getNextPendingTask(capabilities: string[], excludeTaskIds?: string[]) {
    const tasks = await this.prisma.task.findMany({
      where: {
        status: 'pending',
        id: excludeTaskIds ? { notIn: excludeTaskIds } : undefined,
      },
      orderBy: [
        { priority: 'desc' }, // critical > high > medium > low
        { createdAt: 'asc' },
      ],
      take: 1,
    });

    return tasks[0] || null;
  }

  /**
   * Get tasks by filter
   */
  async getTasks(filter: TaskFilter = {}) {
    return await this.prisma.task.findMany({
      where: {
        status: filter.status,
        priority: filter.priority,
        assignedAgentId: filter.assignedAgentId,
        parentTaskId: filter.parentTaskId,
        type: filter.type,
      },
      include: {
        assignedAgent: true,
        parentTask: true,
        subtasks: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit || 100,
      skip: filter.offset || 0,
    });
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string) {
    return await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedAgent: true,
        parentTask: true,
        subtasks: true,
      },
    });
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'pending',
          retryCount: task.retryCount + 1,
          error: null,
          startedAt: null,
          completedAt: null,
        },
      });

      logger.info('Task retried', { taskId, retryCount: task.retryCount + 1 });
    } catch (error) {
      logger.error('Failed to retry task', { error, taskId });
      throw error;
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          include: { assignedAgent: true },
        });

        if (!task) {
          throw new Error(`Task ${taskId} not found`);
        }

        // Cancel task and subtasks
        await tx.task.updateMany({
          where: {
            OR: [{ id: taskId }, { parentTaskId: taskId }],
          },
          data: {
            status: 'cancelled',
          },
        });

        // Update agent workload if assigned
        if (task.assignedAgentId && task.assignedAgent) {
          const newWorkload = Math.max(
            0,
            task.assignedAgent.currentWorkload - 1,
          );
          await tx.agent.update({
            where: { id: task.assignedAgentId },
            data: {
              currentWorkload: newWorkload,
              status: newWorkload === 0 ? 'idle' : 'busy',
              updatedAt: new Date(),
            },
          });
        }
      });

      logger.info('Task cancelled', { taskId });
    } catch (error) {
      logger.error('Failed to cancel task', { error, taskId });
      throw error;
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStats() {
    const stats = await this.prisma.task.groupBy({
      by: ['status'],
      _count: true,
    });

    const priorityStats = await this.prisma.task.groupBy({
      by: ['priority'],
      _count: true,
    });

    return {
      byStatus: stats.reduce(
        (acc, s) => ({ ...acc, [s.status]: s._count }),
        {} as Record<string, number>,
      ),
      byPriority: priorityStats.reduce(
        (acc, p) => ({ ...acc, [p.priority]: p._count }),
        {} as Record<string, number>,
      ),
    };
  }
}
