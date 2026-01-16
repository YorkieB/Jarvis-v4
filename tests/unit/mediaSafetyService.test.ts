import { MediaSafetyService } from '../../src/services/mediaSafetyService';

describe('MediaSafetyService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MEDIA_SAFETY_BLOCK_THRESHOLD = '0.8';
    process.env.MEDIA_SAFETY_SANITIZE_THRESHOLD = '0.5';
    process.env.MEDIA_SAFETY_ALLOWED_CONTENT_TYPES = 'image/jpeg,image/png';
    process.env.MEDIA_SAFETY_MAX_SIZE_BYTES = '5000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks when Stability probability exceeds block threshold', () => {
    const svc = new MediaSafetyService();
    const decision = svc.evaluate({
      source: 'generation',
      provider: 'stability',
      safetySignals: [{ category: 'sexual', probability: 0.95 }],
    });
    expect(decision.action).toBe('block');
    expect(decision.flaggedCategories).toContain('sexual');
  });

  it('sanitizes when Stability probability is between thresholds', () => {
    const svc = new MediaSafetyService();
    const decision = svc.evaluate({
      source: 'generation',
      provider: 'stability',
      safetySignals: [{ category: 'violence', probability: 0.6 }],
    });
    expect(decision.action).toBe('sanitize');
  });

  it('allows when signals are below sanitize threshold', () => {
    const svc = new MediaSafetyService();
    const decision = svc.evaluate({
      source: 'generation',
      provider: 'stability',
      safetySignals: [{ category: 'neutral', probability: 0.1 }],
    });
    expect(decision.action).toBe('allow');
  });

  it('blocks uploads with disallowed content type', () => {
    const svc = new MediaSafetyService();
    const decision = svc.evaluate({
      source: 'upload',
      contentType: 'application/pdf',
    });
    expect(decision.action).toBe('block');
  });

  it('sanitizes uploads that exceed max size', () => {
    const svc = new MediaSafetyService();
    const decision = svc.evaluate({
      source: 'upload',
      contentType: 'image/png',
      sizeBytes: 10_000,
    });
    expect(decision.action).toBe('sanitize');
  });
});
