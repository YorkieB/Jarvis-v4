import logger from '../../utils/logger';
import { FileSystemResource } from './resources/fileSystemResource';
import { JSONObject, McpRequest, McpResponse, RequestContext, ResourceHandler, ToolDefinition } from './types';
import { ToolRegistry } from './toolRegistry';

export interface McpServerOptions {
  resources?: ResourceHandler[];
  toolRegistry?: ToolRegistry;
}

export class McpServer {
  private readonly resources = new Map<string, ResourceHandler>();
  private readonly tools: ToolRegistry;
  private readonly enabled: boolean;

  constructor(options?: McpServerOptions) {
    this.enabled = (process.env.MCP_ENABLED || 'true') === 'true';
    this.tools = options?.toolRegistry || new ToolRegistry();

    const defaultResources = options?.resources || [new FileSystemResource()];
    defaultResources.forEach((r) => this.resources.set(r.name, r));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  registerResource(resource: ResourceHandler): void {
    this.resources.set(resource.name, resource);
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.register(tool);
  }

  listTools(): string[] {
    return this.tools.list();
  }

  async handle(request: McpRequest, ctx?: RequestContext): Promise<McpResponse> {
    if (!this.enabled) {
      return { success: false, error: 'MCP disabled' };
    }

    try {
      if (request.kind === 'resource') {
        return this.handleResource(request, ctx);
      }
      if (request.kind === 'tool') {
        const result = await this.tools.invoke(request.name, request.input, ctx);
        return result;
      }
      return { success: false, error: 'Unsupported request kind' };
    } catch (error) {
      logger.error('MCP handle error', { error });
      return { success: false, error: (error as Error).message };
    }
  }

  private async handleResource(
    request: Extract<McpRequest, { kind: 'resource' }>,
    ctx?: RequestContext,
  ): Promise<McpResponse> {
    const resource = this.resources.get('filesystem');
    if (!resource) {
      return { success: false, error: 'Resource handler not found' };
    }

    if (request.verb === 'list') {
      const entries = await resource.list(request.uri, ctx);
      const data: JSONObject[] = entries.map((entry) => ({ ...entry }));
      return { success: true, data };
    }
    if (request.verb === 'read') {
      const data = await resource.read(request.uri, ctx);
      return { success: true, data };
    }
    if (request.verb === 'stat') {
      const metadata = await resource.stat(request.uri, ctx);
      const data: JSONObject = { ...metadata };
      return { success: true, data };
    }
    return { success: false, error: 'Unsupported resource verb' };
  }
}
