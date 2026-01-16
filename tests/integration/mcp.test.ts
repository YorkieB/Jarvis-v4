import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { FileSystemResource } from '../../src/services/mcp/resources/fileSystemResource';
import { ToolRegistry } from '../../src/services/mcp/toolRegistry';
import { McpToolResult, RequestContext } from '../../src/services/mcp/types';

describe('MCP integration', () => {
  describe('ToolRegistry ACL and schema', () => {
    const ctx: RequestContext = { userId: 'user-1', roles: ['admin'] };

    it('invokes tool when ACL allows user', async () => {
      const registry = new ToolRegistry();
      registry.register({
        name: 'echo',
        description: 'echo tool',
        handler: async (input) => ({ success: true, data: input }),
        acl: [{ effect: 'allow', users: ['user-1'] }],
      });

      const result = (await registry.invoke('echo', { msg: 'hi' }, ctx)) as McpToolResult;
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ msg: 'hi' });
    });

    it('denies tool when ACL denies user', async () => {
      const registry = new ToolRegistry();
      registry.register({
        name: 'secure',
        description: 'secured tool',
        handler: async () => ({ success: true }),
        acl: [{ effect: 'deny', users: ['blocked'] }],
      });

      const result = await registry.invoke('secure', {}, { userId: 'blocked' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Access denied/);
    });

    it('fails schema validation for missing required properties', async () => {
      const registry = new ToolRegistry();
      registry.register({
        name: 'requires-input',
        description: 'requires q',
        schema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
        handler: async () => ({ success: true }),
      });

      const result = await registry.invoke('requires-input', {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing required property/);
    });
  });

  describe('FileSystemResource guards', () => {
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-'));
      await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world', 'utf8');
    });

    it('lists and reads within allowed root', async () => {
      const fsResource = new FileSystemResource([tmpDir]);
      const entries = await fsResource.list(tmpDir);
      expect(entries.some((e) => e.name === 'hello.txt')).toBe(true);

      const content = await fsResource.read(path.join(tmpDir, 'hello.txt'));
      expect(content).toBe('hello world');

      const meta = await fsResource.stat(path.join(tmpDir, 'hello.txt'));
      expect(meta.isDirectory).toBe(false);
    });

    it('rejects access outside allowed roots', async () => {
      const fsResource = new FileSystemResource([tmpDir]);
      await expect(fsResource.read(path.join(tmpDir, '..', 'unauthorized.txt'))).rejects.toThrow(
        /Path not allowed/,
      );
    });
  });
});
