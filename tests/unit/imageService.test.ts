import { ImageService } from '../../src/services/imageService';

describe('ImageService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.STABILITY_API_KEY = 'key';
    process.env.STABILITY_API_BASE = 'https://example.com';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when missing API key', async () => {
    delete process.env.STABILITY_API_KEY;
    const svc = new ImageService();
    await expect(svc.generate({ prompt: 'test' })).rejects.toThrow(
      'Missing STABILITY_API_KEY',
    );
  });

  it('sends generate payload', async () => {
    const svc = new ImageService();
    const mockJson = jest.fn().mockResolvedValue({
      id: 'img1',
      image: 'https://img',
    });
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: mockJson });
    globalThis.fetch = mockFetch;

    await svc.generate({ prompt: 'a cat', style: 'dreamy', seed: 123 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/image/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer key' }),
      }),
    );
  });
});
