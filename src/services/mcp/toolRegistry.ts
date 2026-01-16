import logger from '../../utils/logger';
import { ACLRule, McpToolResult, RequestContext, ToolDefinition, JSONValue, JSONObject } from './types';

function matchList(target?: string, list?: string[]): boolean {
  if (!target || !list || list.length === 0) return false;
  return list.includes(target);
}

function hasIntersection(listA: string[] | undefined, listB: string[] | undefined): boolean {
  if (!listA || !listB) return false;
  return listA.some((a) => listB.includes(a));
}

function evaluateAcl(acl: ACLRule[] | undefined, ctx?: RequestContext): boolean {
  if (!acl || acl.length === 0) return true;
  let allowed = false;
  for (const rule of acl) {
    const userMatch = matchList(ctx?.userId, rule.users);
    const roleMatch = hasIntersection(ctx?.roles, rule.roles);
    const pathMatch =
      rule.paths && typeof ctx?.metadata?.path === 'string'
        ? rule.paths.some((p) => ctx?.metadata?.path?.startsWith(p))
        : false;
    const matched = [userMatch, roleMatch, pathMatch].some(Boolean);
    if (matched) {
      if (rule.effect === 'deny') return false;
      if (rule.effect === 'allow') allowed = true;
    }
  }
  return allowed;
}

function validateAgainstSchema(schema: JSONObject | undefined, input: unknown): { valid: boolean; errors?: string[] } {
  if (!schema) return { valid: true };
  if (typeof schema !== 'object' || Array.isArray(schema) || schema === null) {
    return { valid: false, errors: ['schema must be a JSON object'] };
  }

  const errors: string[] = [];
  const { properties, required } = schema as JSONObject;

  if (properties && typeof properties === 'object') {
    Object.entries(properties as JSONObject).forEach(([key, def]) => {
      const val = (input as JSONObject | undefined)?.[key];
      if (required && Array.isArray(required) && required.includes(key) && val === undefined) {
        errors.push(`missing required property: ${key}`);
        return;
      }
      if (val !== undefined && typeof def === 'object' && def !== null) {
        const expected = (def as JSONObject).type;
        if (expected && typeof expected === 'string') {
          const ok =
            expected === 'array'
              ? Array.isArray(val)
              : expected === 'object'
                ? typeof val === 'object' && val !== null && !Array.isArray(val)
                : typeof val === expected;
          if (!ok) errors.push(`property "${key}" expected type ${expected}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.info('MCP tool registered', { tool: tool.name });
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  async invoke(name: string, input: unknown, ctx?: RequestContext): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}` };
    }

    if (!evaluateAcl(tool.acl, ctx)) {
      return { success: false, error: 'Access denied by ACL' };
    }

    const schemaValidation = validateAgainstSchema(tool.schema, input as JSONValue);
    if (!schemaValidation.valid) {
      return { success: false, error: `Schema validation failed: ${schemaValidation.errors?.join('; ')}` };
    }

    return tool.handler(input, ctx);
  }
}
