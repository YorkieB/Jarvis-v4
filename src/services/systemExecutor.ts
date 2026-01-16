import { spawn } from 'node:child_process';
import os from 'node:os';
import logger from '../utils/logger';
import { metrics } from '../utils/metrics';
import { SandboxAdapter } from './sandbox/sandboxAdapter';
import { SandboxRunOptions, SandboxResult } from './sandbox/types';

export interface ExecuteOptions {
  cmd: string;
  shell?: 'cmd' | 'powershell' | 'bash';
  timeoutMs?: number;
  dryRun?: boolean;
  source?: 'mcp' | 'agent' | 'user';
  allowNetwork?: boolean;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  dryRun: boolean;
}

const DEFAULT_TIMEOUT = 20_000;

function splitCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function redactSecrets(text: string): string {
  return text.replaceAll(/([A-Za-z0-9]{16,})/g, '***');
}

function hasDangerousTokens(cmd: string): boolean {
  // Block common shell metacharacters and command chaining
  return (
    /[;&|`><]/.test(cmd) ||
    cmd.includes('&&') ||
    cmd.includes('||') ||
    cmd.includes('$(') ||
    cmd.includes('${') ||
    /[\r\n]/.test(cmd)
  );
}

function looksLikeSingleCommand(cmd: string): boolean {
  // Allow basic commands with alphanumerics, underscore, dot, slash, backslash, colon, equals, hyphen, and spaces
  return /^[\w./:=\\-]+(?: [\w./:=\\-]+)*$/.test(cmd);
}

export class SystemExecutor {
  private readonly allow: string[];
  private readonly deny: string[];
  private readonly defaultTimeoutMs: number;
  private readonly sandboxEnabled: boolean;
  private readonly sandboxAdapter: SandboxAdapter;
  private readonly sandboxFallbackToHost: boolean;
  private readonly defaultSandboxNetwork: boolean;

  constructor() {
    this.allow = splitCsvEnv(process.env.SYSTEM_CONTROL_ALLOW);
    this.deny = splitCsvEnv(process.env.SYSTEM_CONTROL_DENY);
    const envTimeout = Number(process.env.SYSTEM_EXECUTOR_DEFAULT_TIMEOUT_MS);
    this.defaultTimeoutMs = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT;
    this.sandboxEnabled = (process.env.SANDBOX_ENABLED || 'false') === 'true';
    this.sandboxFallbackToHost = (process.env.SANDBOX_FALLBACK_HOST || 'true') === 'true';
    this.defaultSandboxNetwork = (process.env.SANDBOX_ALLOW_NETWORK || 'false') === 'true';
    this.sandboxAdapter = new SandboxAdapter();
  }

  private isAllowed(cmd: string): boolean {
    if (this.deny.some((p) => cmd.includes(p))) return false;
    if (hasDangerousTokens(cmd)) return false;
    if (!looksLikeSingleCommand(cmd)) return false;
    if (this.allow.length === 0) return false;
    return this.allow.some((p) => cmd.startsWith(p));
  }

  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { cmd, shell, timeoutMs, dryRun, source } = options;
    const safeCmd = redactSecrets(cmd);
    const chosenShell = shell || this.defaultShell();

    if (!this.isAllowed(cmd)) {
      metrics.increment('executor.blocked', { source: source || 'unknown' });
      throw new Error('Command blocked by policy (allowlist/validation)');
    }

    if (this.sandboxEnabled && this.sandboxAdapter.shouldSandbox(cmd)) {
      const sandboxResult = await this.runInSandbox({
        command: cmd,
        timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
        allowNetwork: options.allowNetwork ?? this.defaultSandboxNetwork,
      });
      if (sandboxResult || !this.sandboxFallbackToHost) {
        metrics.increment('executor.sandbox', { source: source || 'unknown', timedOut: sandboxResult.timedOut });
        return sandboxResult;
      }
      logger.warn('Sandbox execution failed or disabled, falling back to host', { cmd });
      metrics.increment('executor.sandbox_fallback', { source: source || 'unknown' });
    }

    if (dryRun) {
      logger.info('SystemExecutor dry-run', { cmd: safeCmd, shell: chosenShell });
      metrics.increment('executor.dry_run', { source: source || 'unknown' });
      return { stdout: '', stderr: '', exitCode: null, timedOut: false, dryRun: true };
    }

    const args = this.buildArgs(chosenShell, cmd);
    const proc = spawn(args.command, args.args, {
      shell: false,
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let exited = false;
    let timedOut = false;

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    const exitPromise = new Promise<ExecuteResult>((resolve) => {
      proc.on('close', (code) => {
        exited = true;
        resolve({
          stdout: redactSecrets(stdout),
          stderr: redactSecrets(stderr),
          exitCode: code,
          timedOut,
          dryRun: false,
        });
      });
    });

    const to = setTimeout(() => {
      if (!exited) {
        timedOut = true;
        proc.kill('SIGTERM');
      }
    }, timeoutMs ?? this.defaultTimeoutMs);

    try {
      const result = await exitPromise;
      metrics.increment('executor.host', { source: source || 'unknown', timedOut: timedOut || false });
      return result;
    } finally {
      clearTimeout(to);
      logger.info('SystemExecutor executed', {
        cmd: safeCmd,
        shell: chosenShell,
        timedOut,
        source: source || 'unknown',
      });
    }
  }

  private async runInSandbox(opts: SandboxRunOptions): Promise<ExecuteResult> {
    const result: SandboxResult = await this.sandboxAdapter.execute(opts);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      dryRun: false,
    };
  }

  async sandboxHealth() {
    return this.sandboxAdapter.health();
  }

  private defaultShell(): ExecuteOptions['shell'] {
    return os.platform() === 'win32' ? 'powershell' : 'bash';
  }

  private buildArgs(shell: ExecuteOptions['shell'], cmd: string): { command: string; args: string[] } {
    if (shell === 'cmd') {
      return { command: 'cmd', args: ['/c', cmd] };
    }
    if (shell === 'powershell') {
      return { command: 'powershell', args: ['-NoLogo', '-NoProfile', '-Command', cmd] };
    }
    // default bash
    return { command: 'bash', args: ['-lc', cmd] };
  }
}

