import fs from 'node:fs/promises';
import { Stats } from 'node:fs';
import path from 'node:path';
import logger from '../../../utils/logger';
import { RequestContext, ResourceHandler, ResourceListEntry, ResourceMetadata } from '../types';

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function ensureWithinRoots(resolved: string, allowedRoots: string[]): void {
  const normalized = path.normalize(resolved);
  const allowed = allowedRoots.some((root) => {
    const normalizedRoot = path.normalize(root);
    return normalized.startsWith(normalizedRoot);
  });
  if (!allowed) {
    throw new Error('Path not allowed by MCP filesystem guard');
  }
}

async function toMetadata(target: string, stats: Stats): Promise<ResourceMetadata> {
  return {
    path: target,
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modified: stats.mtime.toISOString(),
    mimeType: stats.isDirectory() ? 'inode/directory' : undefined,
  };
}

export class FileSystemResource implements ResourceHandler {
  name = 'filesystem';
  description = 'Guarded filesystem resource for list/read/stat';
  private readonly allowedRoots: string[];

  constructor(allowedRoots?: string[]) {
    const envRoots = splitCsv(process.env.MCP_FS_ALLOWED_ROOTS);
    if (allowedRoots?.length) {
      this.allowedRoots = allowedRoots;
    } else if (envRoots.length) {
      this.allowedRoots = envRoots;
    } else {
      this.allowedRoots = [process.cwd()];
    }
  }

  private resolve(target: string): string {
    const resolved = path.resolve(target);
    ensureWithinRoots(resolved, this.allowedRoots);
    return resolved;
  }

  async list(uri: string, ctx?: RequestContext): Promise<ResourceListEntry[]> {
    const dir = this.resolve(uri);
    this.logAccess('list', dir, ctx);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name),
      isDirectory: entry.isDirectory(),
    }));
  }

  async read(uri: string, ctx?: RequestContext): Promise<string> {
    const filePath = this.resolve(uri);
    this.logAccess('read', filePath, ctx);
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  }

  async stat(uri: string, ctx?: RequestContext): Promise<ResourceMetadata> {
    const filePath = this.resolve(uri);
    this.logAccess('stat', filePath, ctx);
    const stats = await fs.stat(filePath);
    return toMetadata(filePath, stats);
  }

  logAccess(action: string, uri: string, ctx?: RequestContext): void {
    logger.info('MCP FS access', {
      action,
      uri,
      userId: ctx?.userId,
      roles: ctx?.roles,
    });
  }
}
