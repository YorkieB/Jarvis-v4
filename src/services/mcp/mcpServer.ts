import logger from '../../utils/logger';
import { FileSystemResource } from './resources/fileSystemResource';
import { McpRequest, McpResponse, RequestContext, ResourceHandler } from './types';
import { ToolRegistry } from './toolRegistry';

export interface McpServerOptions {
  resources?: ResourceHandler[];
  toolRegistry?: ToolRegistry;
}

export class McpServer {
  private resources = new Map<string, ResourceHandler>();
  private tools: ToolRegistry;
  private enabled: boolean;

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

  registerTool = this.tools.register.bind(this.tools);

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
      const data = await resource.list(request.uri, ctx);
      return { success: true, data };
    }
    if (request.verb === 'read') {
      const data = await resource.read(request.uri, ctx);
      return { success: true, data };
    }
    if (request.verb === 'stat') {
      const data = await resource.stat(request.uri, ctx);
      return { success: true, data };
    }
    return { success: false, error: 'Unsupported resource verb' };
  }
}
