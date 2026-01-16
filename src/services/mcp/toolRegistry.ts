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

function isJSONObject(value: unknown): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function evaluateAcl(acl: ACLRule[] | undefined, ctx?: RequestContext): boolean {
  if (!acl || acl.length === 0) return true;
  let allowed = false;
  for (const rule of acl) {
    const userMatch = matchList(ctx?.userId, rule.users);
    const roleMatch = hasIntersection(ctx?.roles, rule.roles);
    const metadataPath = ctx?.metadata?.path;
    const pathMatch =
      rule.paths && typeof metadataPath === 'string'
        ? rule.paths.some((p) => metadataPath.startsWith(p))
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
  if (!isJSONObject(schema)) {
    return { valid: false, errors: ['schema must be a JSON object'] };
  }

  const errors: string[] = [];
  const { properties, required } = schema;
  const inputObj = isJSONObject(input) ? input : undefined;

  const validateProperty = (key: string, def: JSONValue): void => {
    const val = inputObj?.[key];
    if (required && Array.isArray(required) && required.includes(key) && val === undefined) {
      errors.push(`missing required property: ${key}`);
      return;
    }
    if (!isJSONObject(def)) return;
    const expected = def.type;
    if (typeof expected !== 'string') return;

    let matches = false;
    if (expected === 'array') {
      matches = Array.isArray(val);
    } else if (expected === 'object') {
      matches = isJSONObject(val);
    } else {
      matches = typeof val === expected;
    }

    if (!matches) errors.push(`property "${key}" expected type ${expected}`);
  };

  if (properties && isJSONObject(properties)) {
    Object.entries(properties).forEach(([key, def]) => validateProperty(key, def));
  }

  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

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
