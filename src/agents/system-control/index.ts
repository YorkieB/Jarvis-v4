import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';
import { SystemExecutor } from '../../services/systemExecutor';
import { SystemActions } from '../../services/systemActions';
import { RemediationLibrary, RemediationAction } from '../../services/remediationLibrary';
import { McpServer } from '../../services/mcp/mcpServer';
import { McpRequest, RequestContext } from '../../services/mcp/types';

interface ExecRequest {
  cmd: string;
  shell?: 'cmd' | 'powershell' | 'bash';
  timeoutMs?: number;
  dryRun?: boolean;
  allowNetwork?: boolean;
  source?: 'mcp' | 'agent' | 'user';
}

interface FixRequest {
  action: RemediationAction;
}

interface RegistryRequest {
  path: string;
  name?: string;
  value?: string;
  mode: 'read' | 'write';
}

export class SystemControlAgent extends BaseAgent {
  protected agentType = 'system-control';
  protected permissions = ['system:exec', 'system:fix'];

  private prisma: PrismaClient;
  private executor: SystemExecutor;
  private actions: SystemActions;
  private remediation: RemediationLibrary;
  private mcp: McpServer;

  constructor(prismaClient?: PrismaClient) {
    super();
    this.prisma = prismaClient || new PrismaClient();
    this.executor = new SystemExecutor();
    this.actions = new SystemActions(this.executor);
    this.remediation = new RemediationLibrary(this.executor);
    this.mcp = new McpServer();
  }

  async exec(request: ExecRequest) {
    return this.executor.execute({ ...request, source: request.source || 'agent' });
  }

  async fix(request: FixRequest) {
    return this.remediation.run(request.action);
  }

  async registry(request: RegistryRequest) {
    if (request.mode === 'read') {
      return this.actions.registryRead({ path: request.path, name: request.name });
    }
    return this.actions.registryWrite({
      path: request.path,
      name: request.name,
      value: request.value,
    });
  }

  async restartService(name: string) {
    await this.actions.restartService(name);
    return { success: true };
  }

  async inspectProcesses() {
    const output = await this.actions.listProcesses();
    return { output };
  }

  mcpAvailable(): boolean {
    return this.mcp.isEnabled();
  }

  async invokeMcpTool(name: string, input: unknown, ctx?: RequestContext) {
    const request: McpRequest = { kind: 'tool', name, input };
    const response = await this.mcp.handle(request, ctx);
    return response;
  }

  async readMcpResource(path: string, verb: 'list' | 'read' | 'stat', ctx?: RequestContext) {
    const request: McpRequest = { kind: 'resource', verb, uri: path };
    const response = await this.mcp.handle(request, ctx);
    return response;
  }

  async sandboxHealth() {
    return this.executor.sandboxHealth();
  }
}

