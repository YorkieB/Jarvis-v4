export interface SandboxRunOptions {
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  memoryMb?: number;
  cpuShares?: number;
  allowNetwork?: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  sandboxId?: string;
  raw?: unknown;
}

export interface SandboxHealth {
  ok: boolean;
  error?: string;
  provider?: string;
}

export interface SandboxService {
  health(): Promise<SandboxHealth>;
  run(opts: SandboxRunOptions): Promise<SandboxResult>;
}
