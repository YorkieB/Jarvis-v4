import { BaseAgent } from '../agents/base-agent';
import express from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import { addHealthCheck } from '../health';

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
}

export class Orchestrator extends BaseAgent {
  protected agentType = 'orchestrator';
  protected permissions = ['read:*', 'write:sessions'];

  private agents: Map<string, BaseAgent> = new Map();
  private server!: Server;
  private wss!: WebSocketServer;

  async initialize(): Promise<void> {
    // Set up Express server
    const app = express();
    app.use(express.json());

    // Health check endpoints
    addHealthCheck(app);

    this.server = createServer(app);
    this.wss = new WebSocketServer({ server: this.server });

    // WebSocket for real-time communication
    this.wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());
        const response = await this.routeMessage(message);
        ws.send(JSON.stringify(response));
      });
    });

    // REST API
    app.post('/api/message', async (req, res) => {
      // Extract userId from headers, auth token, or request body
      // For now, using placeholder - in production, extract from JWT/session
      const userId =
        req.headers['x-user-id'] ||
        req.body.userId ||
        'anonymous';

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

  async routeMessage(message: AgentMessage): Promise<AgentResponse> {
    const { type } = message;

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

  private async routeToAgent(
    agentType: string,
    message: AgentMessage,
  ): Promise<AgentResponse> {
    // TODO: Implement actual inter-agent communication via message queue
    console.log(`Routing to ${agentType}:`, message);
    return { agent: agentType, status: 'received' };
  }
}
