import { VideoService } from '../../src/services/videoService';

describe('VideoService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.VIDEO_API_KEY = 'vidkey';
    process.env.VIDEO_API_BASE = 'https://video.example.com';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('caps duration to 15 seconds', async () => {
    const svc = new VideoService();
    const mockJson = jest.fn().mockResolvedValue({
      id: 'v1',
      status: 'processing',
    });
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error override fetch
    global.fetch = mockFetch;

    await svc.generate({ prompt: 'short clip', durationSeconds: 40 });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.duration).toBe(15);
  });

  it('throws when missing API key', async () => {
    delete process.env.VIDEO_API_KEY;
    const svc = new VideoService();
    await expect(svc.generate({ prompt: 'test' })).rejects.toThrow(
      'Missing VIDEO_API_KEY',
    );
  });
});
