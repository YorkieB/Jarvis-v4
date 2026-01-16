import { VideoEditService } from '../../src/services/videoEditService';

describe('VideoEditService', () => {
  it('returns succeeded edit job with lineage metadata', async () => {
    const svc = new VideoEditService();
    const result = await svc.edit({
      action: 'trim',
      sources: ['vidA'],
      startSeconds: 1,
      endSeconds: 5,
      prompt: 'trim intro',
    });

    expect(result.status).toBe('succeeded');
    expect(result.metadata?.action).toBe('trim');
    expect(result.metadata?.sources).toContain('vidA');
    expect(result.videoUrl).toBeDefined();
  });

  it('requires two sources for stitch', async () => {
    const svc = new VideoEditService();
    await expect(
      svc.edit({
        action: 'stitch',
        sources: ['only-one'],
      }),
    ).rejects.toThrow('Stitch requires at least two sources');
  });

  it('requires overlayUrl for overlay action', async () => {
    const svc = new VideoEditService();
    await expect(
      svc.edit({
        action: 'overlay',
        sources: ['base'],
      }),
    ).rejects.toThrow('Overlay requires overlayUrl');
  });
});
