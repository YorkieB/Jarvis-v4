export type JSONObject = { [key: string]: JSONValue };
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | JSONObject;

export interface RequestContext {
  userId?: string;
  roles?: string[];
  source?: string;
  ip?: string;
  metadata?: JSONObject;
}

export interface ACLRule {
  effect: 'allow' | 'deny';
  users?: string[];
  roles?: string[];
  paths?: string[];
}

export interface ToolDefinition {
  name: string;
  description?: string;
  schema?: JSONObject;
  acl?: ACLRule[];
  handler: (input: unknown, ctx?: RequestContext) => Promise<McpToolResult>;
}

export interface McpToolResult {
  success: boolean;
  data?: JSONValue;
  error?: string;
  metadata?: JSONObject;
}

export interface ResourceListEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

export interface ResourceMetadata {
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  mimeType?: string;
}

export interface ResourceHandler {
  name: string;
  description?: string;
  list(uri: string, ctx?: RequestContext): Promise<ResourceListEntry[]>;
  read(uri: string, ctx?: RequestContext): Promise<string>;
  stat(uri: string, ctx?: RequestContext): Promise<ResourceMetadata>;
}

export type McpRequest =
  | {
      kind: 'resource';
      verb: 'list' | 'read' | 'stat';
      uri: string;
    }
  | {
      kind: 'tool';
      name: string;
      input: unknown;
    };

export interface McpResponse {
  success: boolean;
  data?: JSONValue;
  error?: string;
  metadata?: JSONObject;
}
