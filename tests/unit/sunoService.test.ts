import { SunoService } from '../../src/services/sunoService';

describe('SunoService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUNO_API_KEY = 'test-key';
    process.env.SUNO_API_BASE = 'https://example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('sends prompt and defaults duration to full', async () => {
    const svc = new SunoService();
    const mockJson = jest.fn().mockResolvedValue({
      id: 't1',
      status: 'succeeded',
      audio_url: 'https://audio',
    });
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error override global fetch for test
    global.fetch = mockFetch;

    await svc.generate({ prompt: 'lofi beat' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.prompt).toBe('lofi beat');
    expect(body.duration).toBe('full');
  });

  it('throws on missing API key', async () => {
    delete process.env.SUNO_API_KEY;
    const svc = new SunoService();
    await expect(svc.generate({ prompt: 'test' })).rejects.toThrow(
      'Missing SUNO_API_KEY',
    );
  });
});
