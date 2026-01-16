import logger from '../../utils/logger';
import { SandboxHealth, SandboxResult, SandboxRunOptions, SandboxService } from './types';

type E2bSandboxInstance = {
  id?: string;
  run?: (cmd: string, opts?: Record<string, unknown>) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>;
  close?: () => Promise<void>;
};

type E2bSandboxCtor = {
  create: (options: Record<string, unknown>) => Promise<E2bSandboxInstance>;
};

/**
 * E2B micro-VM sandbox wrapper.
 * Uses dynamic import to avoid hard dependency failures if SDK is unavailable at runtime.
 */
export class E2bSandboxService implements SandboxService {
  private apiKey: string;
  private templateId: string;
  private defaultTimeoutMs: number;
  private sandboxCtor: E2bSandboxCtor | null = null;

  constructor(options?: { apiKey?: string; templateId?: string; defaultTimeoutMs?: number }) {
    this.apiKey = options?.apiKey || process.env.E2B_API_KEY || '';
    this.templateId = options?.templateId || process.env.E2B_TEMPLATE_ID || 'base';
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? Number(process.env.SANDBOX_DEFAULT_TIMEOUT_MS || 20_000);
  }

  async health(): Promise<SandboxHealth> {
    try {
      await this.loadClient();
      if (!this.apiKey) return { ok: false, error: 'E2B_API_KEY missing', provider: 'e2b' };
      return { ok: true, provider: 'e2b' };
    } catch (error) {
      return { ok: false, error: (error as Error).message, provider: 'e2b' };
    }
  }

  async run(opts: SandboxRunOptions): Promise<SandboxResult> {
    const sandboxCtor = await this.loadClient();
    if (!this.apiKey) {
      throw new Error('E2B_API_KEY is required for sandbox execution');
    }

    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let sandbox: E2bSandboxInstance | null = null;
    try {
      sandbox = await sandboxCtor.create({
        apiKey: this.apiKey,
        templateId: this.templateId,
        env: opts.env,
      });

      const runner = sandbox.run;
      if (typeof runner !== 'function') {
        throw new Error('E2B sandbox client missing run(command, opts) method');
      }

      const result = await runner(opts.command, {
        workdir: opts.workdir,
        timeoutMs,
        cpuLimit: opts.cpuShares,
        memoryLimitMb: opts.memoryMb,
        allowNetwork: opts.allowNetwork ?? false,
        signal: controller.signal,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? null,
        timedOut: controller.signal.aborted,
        sandboxId: sandbox.id,
        raw: result,
      };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      logger.warn('E2B sandbox run failed', {
        error,
        timedOut,
      });
      return {
        stdout: '',
        stderr: timedOut ? 'Sandbox execution timed out' : (error as Error).message,
        exitCode: null,
        timedOut,
        sandboxId: sandbox?.id,
      };
    } finally {
      clearTimeout(timeout);
      try {
        await sandbox?.close?.();
      } catch (closeErr) {
        logger.warn('Failed to close sandbox', { error: closeErr });
      }
    }
  }

  private async loadClient(): Promise<E2bSandboxCtor> {
    if (this.sandboxCtor) return this.sandboxCtor;
    try {
      // Prefer @e2b/sdk, fallback to e2b
      const mod = (await import('@e2b/sdk').catch(async () => import('e2b'))) as any;
      const SandboxCtor: E2bSandboxCtor | undefined = mod?.Sandbox || mod?.default?.Sandbox || mod?.default;
      if (!SandboxCtor?.create) {
        throw new Error('E2B SDK missing Sandbox.create');
      }
      this.sandboxCtor = SandboxCtor;
      return SandboxCtor;
    } catch (error) {
      logger.error('Failed to load E2B SDK', { error });
      throw error;
    }
  }
}
