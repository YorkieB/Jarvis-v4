import { BaseAgent } from '../agents/base-agent';
import express from 'express';
import type { Server } from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { addHealthCheck } from '../health';
import { prisma as globalPrisma } from '../utils/prisma';
import { AgentManagerService } from '../services/agentManagerService';
import { TaskQueueService } from '../services/taskQueueService';
import { WorkloadMonitorService } from '../services/workloadMonitorService';
import logger from '../utils/logger';
import { TaskDecomposition } from '../types/agentTypes';

type PrismaClient = typeof globalPrisma;

interface AgentMessage {
  type: string;
  content?: string;
  sessionId?: string;
  userId?: string;
  conversationId?: string;
}

interface AgentResponse {
  agent: string;
  status: string;
  taskId?: string;
  result?: unknown;
}

export class Orchestrator extends BaseAgent {
  protected agentType = 'orchestrator';
  protected permissions = ['read:*', 'write:sessions'];

  private readonly agents: Map<string, BaseAgent> = new Map();
  private server!: Server;
  private wss!: WebSocketServer;
  private readonly prisma: PrismaClient;
  private readonly agentManager: AgentManagerService;
  private readonly taskQueue: TaskQueueService;
  private readonly workloadMonitor: WorkloadMonitorService;
  private orchestratorAgentId?: string;

  constructor(prisma?: PrismaClient) {
    super();
    this.prisma = prisma || globalPrisma;
    this.agentManager = new AgentManagerService(this.prisma);
    this.taskQueue = new TaskQueueService(this.prisma, this.agentManager);
    this.workloadMonitor = new WorkloadMonitorService(
      this.prisma,
      this.agentManager,
      this.taskQueue,
    );
  }

  private async initializeOrchestratorAgent(): Promise<void> {
    try {
      // Find or create orchestrator agent record
      const existing = await this.prisma.agent.findFirst({
        where: { agentType: 'orchestrator' },
      });

      if (existing) {
        this.orchestratorAgentId = existing.id;
        await this.agentManager.updateAgentStatus(existing.id, 'idle', 0);
      } else {
        // Create orchestrator agent record (no parent)
        const agent = await this.prisma.agent.create({
          data: {
            agentType: 'orchestrator',
            capabilities: ['routing', 'delegation', 'task_decomposition'],
            maxConcurrentTasks: 20,
            status: 'idle',
            currentWorkload: 0,
            healthScore: 100,
            lastHeartbeat: new Date(),
          },
        });
        this.orchestratorAgentId = agent.id;
      }
    } catch (error) {
      logger.error('Failed to initialize orchestrator agent', { error });
    }
  }

  async initialize(): Promise<void> {
    // Initialize orchestrator agent in database
    await this.initializeOrchestratorAgent();

    // Start workload monitoring
    this.workloadMonitor.startMonitoring(30000);

    // Set up Express server
    const app = express();
    app.disable('x-powered-by');
    const HTTPS_ENFORCE = (process.env.HTTPS_ENFORCE || 'true') !== 'false';
    if (HTTPS_ENFORCE) {
      app.enable('trust proxy');
      app.use((req, res, next) => {
        const proto =
          (req.headers['x-forwarded-proto'] as string) || req.protocol;
        if (proto !== 'https') {
          const host = req.headers.host;
          return res.redirect(301, `https://${host}${req.originalUrl}`);
        }
        return next();
      });
    }
    app.use(express.json());

    // Health check endpoints
    addHealthCheck(app);

    this.server = this.createAppServer(app);
    this.wss = new WebSocketServer({ server: this.server });

    // WebSocket for real-time communication
    this.wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        let raw: string;
        if (typeof data === 'string') {
          raw = data;
        } else if (data instanceof Buffer) {
          raw = data.toString('utf8');
        } else if (ArrayBuffer.isView(data)) {
          raw = Buffer.from(
            data.buffer,
            data.byteOffset,
            data.byteLength,
          ).toString('utf8');
        } else if (data instanceof ArrayBuffer) {
          raw = Buffer.from(data).toString('utf8');
        } else {
          raw = JSON.stringify(data);
        }

        const message = JSON.parse(raw);
        const response = await this.routeMessage(message);
        ws.send(JSON.stringify(response));
      });
    });

    // REST API
    app.post('/api/message', async (req, res) => {
      // Extract userId from headers, auth token, or request body
      // For now, using placeholder - in production, extract from JWT/session
      const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous';

      const messageWithUserId = {
        ...req.body,
        userId,
      };

      const response = await this.routeMessage(messageWithUserId);
      res.json(response);
    });

    // Start server
    const port = process.env.PORT || 3000;
    this.server.listen(port, () => {
      console.log(`🎯 Orchestrator listening on port ${port}`);
    });
  }

  private createAppServer(app: express.Application): Server {
    const keyPath = process.env.HTTPS_KEY_PATH;
    const certPath = process.env.HTTPS_CERT_PATH;
    if (!keyPath || !certPath) {
      throw new Error(
        'HTTPS_KEY_PATH and HTTPS_CERT_PATH are required for orchestrator HTTPS-only mode',
      );
    }
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      throw new Error('Orchestrator HTTPS cert or key path not found');
    }
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    logger.info('Starting orchestrator HTTPS server (strict HTTPS-only mode)');
    return https.createServer({ key, cert }, app) as unknown as Server;
  }
  async routeMessage(message: AgentMessage): Promise<AgentResponse> {
    const { type, content } = message;

    // Check if task should be decomposed
    const shouldDecompose = await this.shouldDecomposeTask(type, content);

    if (shouldDecompose) {
      return await this.decomposeAndDelegate(message);
    }

    // Route based on intent
    switch (type) {
      case 'conversation':
        return await this.routeToAgent('dialogue', message);
      case 'search':
        return await this.routeToAgent('web', message);
      case 'music':
        return await this.routeToAgent('spotify', message);
      default:
        return await this.routeToAgent('dialogue', message);
    }
  }

  /**
   * Determine if a task should be decomposed into subtasks
   */
  private async shouldDecomposeTask(
    type: string,
    content?: string,
  ): Promise<boolean> {
    // Decompose complex tasks (e.g., multi-step operations)
    const complexTaskTypes = ['complex_query', 'multi_step', 'batch_operation'];
    if (complexTaskTypes.includes(type)) {
      return true;
    }

    // Decompose if content is very long (indicates complexity)
    if (content && content.length > 1000) {
      return true;
    }

    return false;
  }

  /**
   * Decompose task and delegate to child agents
   */
  private async decomposeAndDelegate(
    message: AgentMessage,
  ): Promise<AgentResponse> {
    try {
      // Create parent task
      const parentTaskId = await this.taskQueue.createTask(
        message.type,
        message as unknown as Record<string, unknown>,
        'high',
      );

      // Decompose task
      const decomposition = await this.decomposeTask(message);

      // Create subtasks
      const subtaskIds: string[] = [];
      for (const subtask of decomposition.subtasks) {
        const subtaskId = await this.taskQueue.createTask(
          subtask.type,
          subtask.payload,
          subtask.priority,
          parentTaskId,
        );
        subtaskIds.push(subtaskId);
      }

      // Assign subtasks to available agents
      for (const subtaskId of subtaskIds) {
        await this.assignTaskToAgent(subtaskId, decomposition.subtasks);
      }

      return {
        agent: 'orchestrator',
        status: 'delegated',
        taskId: parentTaskId,
      };
    } catch (error) {
      logger.error('Failed to decompose and delegate task', { error });
      return {
        agent: 'orchestrator',
        status: 'error',
      };
    }
  }

  /**
   * Decompose a task into subtasks
   */
  private async decomposeTask(
    message: AgentMessage,
  ): Promise<TaskDecomposition> {
    // Simple decomposition logic - can be enhanced with LLM
    const subtasks =
      message.type === 'complex_query'
        ? [
            {
              type: 'conversation',
              payload: { content: message.content },
              priority: 'high' as const,
            },
            {
              type: 'search',
              payload: { query: message.content },
              priority: 'medium' as const,
            },
          ]
        : [
            {
              type: message.type,
              payload: message as unknown as Record<string, unknown>,
              priority: 'medium' as const,
            },
          ];

    return {
      parentTaskId: '', // Will be set by caller
      subtasks,
    };
  }

  /**
   * Assign a task to an available agent
   */
  private async assignTaskToAgent(
    taskId: string,
    _subtasks: TaskDecomposition['subtasks'],
  ): Promise<void> {
    try {
      const task = await this.taskQueue.getTask(taskId);
      if (!task) {
        return;
      }

      // Determine required capabilities based on task type
      const requiredCapabilities = this.getRequiredCapabilities(task.type);

      // Find available agents
      const availableAgents =
        await this.agentManager.findAvailableAgents(requiredCapabilities);

      if (availableAgents.length > 0) {
        // Assign to first available agent
        await this.taskQueue.assignTask(taskId, availableAgents[0].id);
      } else if (this.orchestratorAgentId) {
        // Spawn new child agent if needed
        const agentType = this.mapTaskTypeToAgentType(task.type);
        const childId = await this.agentManager.spawnChildAgent(
          this.orchestratorAgentId,
          agentType,
        );
        await this.taskQueue.assignTask(taskId, childId);
      }
    } catch (error) {
      logger.error('Failed to assign task to agent', { error, taskId });
    }
  }

  /**
   * Get required capabilities for a task type
   */
  private getRequiredCapabilities(taskType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      conversation: ['dialogue', 'llm'],
      search: ['web_search', 'content_extraction'],
      music: ['spotify', 'music_control'],
      music_generate: ['music_control'],
      music_variation: ['music_control'],
      music_stems: ['music_control'],
      image_generate: ['media'],
      image_edit: ['media'],
      video_generate: ['media'],
      video_edit: ['media'],
      syntax_check: ['syntax_analysis'],
      type_check: ['type_checking'],
      sync_truelayer: ['finance'],
      finance: ['finance'],
      alerts: ['alerts'],
      system_control: ['system_control'],
      exec_command: ['system_control'],
      restart_service: ['system_control'],
      flush_dns: ['system_control'],
      fix_network: ['system_control'],
      camera_discover: ['vision'],
      camera_connect: ['vision'],
      camera_stream: ['vision'],
      camera_ptz: ['vision'],
      vision_detect: ['vision'],
      vision_record: ['vision'],
    };

    return capabilityMap[taskType] || ['general'];
  }

  /**
   * Map task type to agent type
   */
  private mapTaskTypeToAgentType(taskType: string): string {
    const mapping: Record<string, string> = {
      conversation: 'dialogue-agent',
      search: 'web-agent',
      music: 'spotify-agent',
      music_generate: 'music-agent',
      music_variation: 'music-agent',
      music_stems: 'music-agent',
      image_generate: 'media-agent',
      image_edit: 'media-agent',
      video_generate: 'media-agent',
      video_edit: 'media-agent',
      syntax_check: 'syntax-checker',
      type_check: 'type-analyzer',
      sync_truelayer: 'finance-agent',
      finance: 'finance-agent',
      alerts: 'alert-agent',
      system_control: 'system-control',
      exec_command: 'system-control',
      restart_service: 'system-control',
      flush_dns: 'system-control',
      fix_network: 'system-control',
      camera_discover: 'vision-agent',
      camera_connect: 'vision-agent',
      camera_stream: 'vision-agent',
      camera_ptz: 'vision-agent',
      vision_detect: 'vision-agent',
      vision_record: 'vision-agent',
    };

    return mapping[taskType] || 'dialogue-agent';
  }

  private async routeToAgent(
    agentType: string,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    try {
      // Create task
      const taskId = await this.taskQueue.createTask(
        message.type,
        message as unknown as Record<string, unknown>,
        'medium',
      );

      // Assign to agent
      await this.assignTaskToAgent(taskId, []);

      logger.info(`Routing to ${agentType}`, { taskId, agentType });
      return { agent: agentType, status: 'received', taskId };
    } catch (error) {
      logger.error('Failed to route message', { error, agentType });
      return { agent: agentType, status: 'error' };
    }
  }
}
