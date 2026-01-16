import { SystemActions } from '../../src/services/systemActions';
import { SystemExecutor } from '../../src/services/systemExecutor';

describe('SystemActions', () => {
  const actions = new SystemActions(new SystemExecutor());

  it('supports pingHost (fast fail allowed)', async () => {
    const ok = await actions.pingHost('localhost');
    expect(typeof ok).toBe('boolean');
  });

  it('registry read throws on non-windows', async () => {
    if (process.platform === 'win32') return;
    await expect(
      actions.registryRead({ path: 'HKCU:\\Software' }),
    ).rejects.toThrow();
  });
});

