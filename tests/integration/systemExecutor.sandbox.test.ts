import { SystemExecutor } from '../../src/services/systemExecutor';

describe('SystemExecutor sandbox policy', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('routes to sandbox when enabled and policy requires it', async () => {
    process.env.SANDBOX_ENABLED = 'true';
    process.env.SANDBOX_FALLBACK_HOST = 'false';
    const executor = new SystemExecutor();

    const sandboxExecute = jest.fn(async () => ({
      stdout: 'sandboxed',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    }));

    // Inject stubbed sandbox adapter
    (executor as any).sandboxAdapter = {
      shouldSandbox: jest.fn(() => true),
      execute: sandboxExecute,
      health: jest.fn(),
    };

    const result = await executor.execute({ cmd: 'echo sandbox' });
    expect(sandboxExecute).toHaveBeenCalled();
    expect(result.stdout).toBe('sandboxed');
    expect(result.dryRun).toBe(false);
  });

  it('respects dry-run when sandbox not required', async () => {
    process.env.SANDBOX_ENABLED = 'false';
    const executor = new SystemExecutor();

    // Sandbox adapter should not be called when disabled
    (executor as any).sandboxAdapter = {
      shouldSandbox: jest.fn(() => false),
      execute: jest.fn(),
      health: jest.fn(),
    };

    const result = await executor.execute({ cmd: 'echo host', dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
