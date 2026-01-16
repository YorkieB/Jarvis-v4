import logger from '../../utils/logger';
import { metrics } from '../../utils/metrics';
import { E2bSandboxService } from './e2bSandboxService';
import { SandboxHealth, SandboxResult, SandboxRunOptions, SandboxService } from './types';

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SandboxPolicyOptions {
  allow?: string[];
  deny?: string[];
  forceSandbox?: boolean;
}

export class SandboxAdapter {
  private sandbox: SandboxService;
  private allow: string[];
  private deny: string[];
  private forceSandbox: boolean;

  constructor(service?: SandboxService, policy?: SandboxPolicyOptions) {
    this.sandbox = service || new E2bSandboxService();
    this.allow = policy?.allow ?? splitCsv(process.env.SANDBOX_ALLOW);
    this.deny = policy?.deny ?? splitCsv(process.env.SANDBOX_DENY);
    this.forceSandbox = policy?.forceSandbox ?? (process.env.SANDBOX_FORCE || 'false') === 'true';
  }

  shouldSandbox(cmd: string): boolean {
    if (this.deny.some((p) => cmd.includes(p))) return true;
    if (this.allow.length > 0) return this.allow.some((p) => cmd.startsWith(p));
    return this.forceSandbox;
  }

  async execute(opts: SandboxRunOptions): Promise<SandboxResult> {
    const runInSandbox = this.forceSandbox || this.shouldSandbox(opts.command);
    if (!runInSandbox) {
      metrics.increment('sandbox.bypassed', { reason: 'policy' });
      return {
        stdout: '',
        stderr: 'Sandbox not required by policy',
        exitCode: null,
        timedOut: false,
      };
    }
    logger.info('Executing command in sandbox', { cmd: opts.command });
    const result = await this.sandbox.run(opts);
    metrics.increment('sandbox.executed', { timedOut: result.timedOut });
    return result;
  }

  async health(): Promise<SandboxHealth> {
    if (typeof this.sandbox.health !== 'function') {
      return { ok: false, error: 'Health check not supported' };
    }
    return this.sandbox.health();
  }
}
