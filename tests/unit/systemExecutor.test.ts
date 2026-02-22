import { SystemExecutor } from '../../src/services/systemExecutor';

describe('SystemExecutor', () => {
  it('blocks denied commands', async () => {
    process.env.SYSTEM_CONTROL_DENY = 'rm -rf';
    const exec = new SystemExecutor();
    await expect(exec.execute({ cmd: 'rm -rf /' })).rejects.toThrow();
  });

  it('allows dry-run without execution', async () => {
    const original = process.env.SYSTEM_CONTROL_ALLOW;
    process.env.SYSTEM_CONTROL_ALLOW = 'echo';
    const exec = new SystemExecutor();
    const result = await exec.execute({ cmd: 'echo hello', dryRun: true });
    process.env.SYSTEM_CONTROL_ALLOW = original;
    expect(result.dryRun).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
