import { SystemActions } from '../../src/services/systemActions';
import { SystemExecutor, ExecuteResult } from '../../src/services/systemExecutor';

class MockExecutor {
  execute = jest.fn<Promise<ExecuteResult>, Parameters<SystemExecutor['execute']>>(
    async () => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      dryRun: false,
    }),
  );
}

describe('SystemActions', () => {
  let mockExecutor: MockExecutor;
  let actions: SystemActions;

  beforeEach(() => {
    mockExecutor = new MockExecutor();
    actions = new SystemActions(mockExecutor as unknown as SystemExecutor);
  });

  it('supports pingHost (fast fail allowed)', async () => {
    mockExecutor.execute.mockResolvedValueOnce({
      stdout: 'pong',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      dryRun: false,
    });
    const ok = await actions.pingHost('localhost');
    expect(ok).toBe(true);
    expect(mockExecutor.execute).toHaveBeenCalled();
  });

  it('registry read throws on non-windows', async () => {
    if (process.platform === 'win32') return;
    await expect(
      actions.registryRead({ path: 'HKCU:\Software' }),
    ).rejects.toThrow();
  });
});
