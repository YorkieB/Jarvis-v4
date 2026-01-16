/**
 * Agent Manager Service
 * Manages spawning, lifecycle, and health of child agents
 */

import logger from '../utils/logger';
import { prisma as globalPrisma } from '../utils/prisma';
import {
  AgentStatus,
  AgentCapabilities,
  AgentHealthMetrics,
} from '../types/agentTypes';

type PrismaClient = typeof globalPrisma;

export class AgentManagerService {
  private readonly prisma: PrismaClient;
  private readonly agentRegistry: Map<string, AgentCapabilities> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeAgentRegistry();
  }

  /**
   * Initialize registry of available agent types and their capabilities
   */
  private initializeAgentRegistry(): void {
    // Register core agent types
    this.agentRegistry.set('syntax-checker', {
      agentType: 'syntax-checker',
      capabilities: ['syntax_analysis', 'error_detection'],
      maxConcurrentTasks: 10,
    });

    this.agentRegistry.set('type-analyzer', {
      agentType: 'type-analyzer',
      capabilities: ['type_checking', 'type_inference'],
      maxConcurrentTasks: 8,
    });

    this.agentRegistry.set('conversation-parser', {
      agentType: 'conversation-parser',
      capabilities: ['intent_extraction', 'entity_recognition'],
      maxConcurrentTasks: 5,
    });

    this.agentRegistry.set('web-searcher', {
      agentType: 'web-searcher',
      capabilities: ['web_search', 'content_extraction'],
      maxConcurrentTasks: 3,
    });

    this.agentRegistry.set('health-monitor', {
      agentType: 'health-monitor',
      capabilities: ['health_checking', 'metrics_collection'],
      maxConcurrentTasks: 5,
    });

    // Core runtime agents (critical path)
    this.agentRegistry.set('dialogue-agent', {
      agentType: 'dialogue-agent',
      capabilities: ['dialogue', 'llm'],
      maxConcurrentTasks: 20,
    });

    this.agentRegistry.set('web-agent', {
      agentType: 'web-agent',
      capabilities: ['web_search', 'content_extraction'],
      maxConcurrentTasks: 10,
    });

    this.agentRegistry.set('spotify-agent', {
      agentType: 'spotify-agent',
      capabilities: ['music_control'],
      maxConcurrentTasks: 5,
    });

    this.agentRegistry.set('music-agent', {
      agentType: 'music-agent',
      capabilities: ['music_control'],
      maxConcurrentTasks: 8,
    });

    this.agentRegistry.set('media-agent', {
      agentType: 'media-agent',
      capabilities: ['media'],
      maxConcurrentTasks: 6,
    });

    this.agentRegistry.set('finance-agent', {
      agentType: 'finance-agent',
      capabilities: ['finance'],
      maxConcurrentTasks: 6,
    });

    this.agentRegistry.set('alert-agent', {
      agentType: 'alert-agent',
      capabilities: ['alerts'],
      maxConcurrentTasks: 4,
    });

    this.agentRegistry.set('vision-agent', {
      agentType: 'vision-agent',
      capabilities: ['vision'],
      maxConcurrentTasks: 6,
    });

    this.agentRegistry.set('system-control', {
      agentType: 'system-control',
      capabilities: ['system_control'],
      maxConcurrentTasks: 3,
    });

    logger.info('Agent registry initialized', {
      agentCount: this.agentRegistry.size,
    });
  }

  /**
   * Spawn a new child agent
   */
  async spawnChildAgent(
    parentId: string,
    agentType: string,
  ): Promise<string> {
    const capabilities = this.agentRegistry.get(agentType);
    if (!capabilities) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    try {
      const agent = await this.prisma.agent.create({
        data: {
          agentType,
          parentId,
          capabilities: capabilities.capabilities,
          maxConcurrentTasks: capabilities.maxConcurrentTasks,
          status: 'idle',
          currentWorkload: 0,
          healthScore: 100,
          lastHeartbeat: new Date(),
        },
      });

      logger.info('Child agent spawned', {
        agentId: agent.id,
        agentType,
        parentId,
      });

      return agent.id;
    } catch (error) {
      logger.error('Failed to spawn child agent', { error, agentType });
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string) {
    return await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        parent: true,
        children: true,
        tasks: true,
        failures: {
          where: { recovered: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    workload?: number,
  ): Promise<void> {
    try {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status,
          currentWorkload: workload,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update agent status', { error, agentId, status });
      throw error;
    }
  }

  /**
   * Update agent health score
   */
  async updateHealthScore(
    agentId: string,
    healthScore: number,
  ): Promise<void> {
    try {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          healthScore: Math.max(0, Math.min(100, healthScore)),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update health score', { error, agentId });
      throw error;
    }
  }

  /**
   * Get available agents for a task
   */
  async findAvailableAgents(
    capabilities: string[],
    excludeAgentIds?: string[],
  ) {
    const agents = await this.prisma.agent.findMany({
      where: {
        status: { in: ['idle', 'busy'] },
        healthScore: { gte: 50 }, // Only healthy agents
        capabilities: { hasSome: capabilities },
        id: excludeAgentIds ? { notIn: excludeAgentIds } : undefined,
      },
      orderBy: [
        { currentWorkload: 'asc' },
        { healthScore: 'desc' },
      ],
    });

    return agents.filter(
      (agent: { currentWorkload: number; maxConcurrentTasks: number }) =>
        agent.currentWorkload < agent.maxConcurrentTasks,
    );
  }

  /**
   * Get agent health metrics
   */
  async getAgentHealthMetrics(agentId: string): Promise<AgentHealthMetrics | null> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        failures: {
          where: {
            recovered: false,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        },
      },
    });

    if (!agent) {
      return null;
    }

    return {
      agentId: agent.id,
      healthScore: agent.healthScore,
      status: agent.status as AgentStatus,
      currentWorkload: agent.currentWorkload,
      lastHeartbeat: agent.lastHeartbeat,
      consecutiveFailures: agent.failures.length,
    };
  }

  /**
   * List all agents
   */
  async listAgents(parentId?: string) {
    return await this.prisma.agent.findMany({
      where: parentId ? { parentId } : undefined,
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            tasks: true,
            failures: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Remove/stop an agent
   */
  async removeAgent(agentId: string): Promise<void> {
    try {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          status: 'stopped',
          updatedAt: new Date(),
        },
      });

      logger.info('Agent removed', { agentId });
    } catch (error) {
      logger.error('Failed to remove agent', { error, agentId });
      throw error;
    }
  }

  /**
   * Get agent registry
   */
  getAgentRegistry(): Map<string, AgentCapabilities> {
    return this.agentRegistry;
  }
}
