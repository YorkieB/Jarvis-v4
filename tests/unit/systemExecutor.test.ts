import { SystemExecutor } from '../../src/services/systemExecutor';

describe('SystemExecutor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SYSTEM_CONTROL_ALLOW: 'echo,ping',
      SYSTEM_CONTROL_DENY: '',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks denied commands', async () => {
    process.env.SYSTEM_CONTROL_DENY = 'rm -rf';
    const exec = new SystemExecutor();
    await expect(exec.execute({ cmd: 'rm -rf /' })).rejects.toThrow();
  });

  it('allows dry-run without execution', async () => {
    const exec = new SystemExecutor();
    const result = await exec.execute({ cmd: 'echo hello', dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
