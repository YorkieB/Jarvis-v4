import VoiceAuthService from '../../src/services/voiceAuthService';

jest.mock('@deepgram/sdk', () => ({
  createClient: jest.fn(() => ({})),
}));

describe('VoiceAuthService (integration-mocked)', () => {
  const prisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers ONNX embedding when available', async () => {
    const service = new VoiceAuthService(prisma as any) as any;
    const dim = service.getTargetEmbeddingDim();
    const onnxEmbedding = new Array(dim).fill(0).map((_, i) => (i === 0 ? 1 : 0));

    service.runOnnxEmbedding = jest.fn(async () => onnxEmbedding);
    service.fetchExternalEmbedding = jest.fn(async () => null);

    const features = await (service as any).extractVoiceFeatures(Buffer.alloc(320));
    expect(features.embedding).toEqual(onnxEmbedding);
    expect(service.runOnnxEmbedding).toHaveBeenCalled();
    expect(service.fetchExternalEmbedding).not.toHaveBeenCalled();
  });

  it('falls back to external embedding when ONNX fails', async () => {
    const service = new VoiceAuthService(prisma as any) as any;
    const dim = service.getTargetEmbeddingDim();
    const externalEmbedding = new Array(dim).fill(1 / Math.sqrt(dim));

    service.runOnnxEmbedding = jest.fn(async () => null);
    service.fetchExternalEmbedding = jest.fn(async () => externalEmbedding);

    const features = await (service as any).extractVoiceFeatures(Buffer.alloc(320));
    expect(features.embedding.length).toBe(dim);
    expect(service.runOnnxEmbedding).toHaveBeenCalled();
    expect(service.fetchExternalEmbedding).toHaveBeenCalled();
  });

  it('requires minimum samples for enrollment', async () => {
    const service = new VoiceAuthService(prisma as any) as any;
    const dim = service.getTargetEmbeddingDim();
    service.extractVoiceFeatures = jest.fn(async () => ({
      embedding: new Array(dim).fill(0),
      sampleDuration: 5,
      sampleQuality: 1,
    }));

    await expect(service.enrollVoiceprint('user-1', [Buffer.alloc(100), Buffer.alloc(100)])).rejects.toThrow(
      /At least 3 audio samples/,
    );
  });

  it('enrolls when requirements met and stores embedding', async () => {
    const service = new VoiceAuthService(prisma as any) as any;
    const dim = service.getTargetEmbeddingDim();
    service.extractVoiceFeatures = jest.fn(async () => ({
      embedding: new Array(dim).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
      sampleDuration: 6,
      sampleQuality: 1,
    }));

    await service.enrollVoiceprint('user-1', [Buffer.alloc(100), Buffer.alloc(100), Buffer.alloc(100)]);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('verifies voice against stored embedding', async () => {
    const service = new VoiceAuthService(prisma as any) as any;
    const dim = service.getTargetEmbeddingDim();
    const unitEmbedding = new Array(dim).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    prisma.$queryRaw.mockResolvedValueOnce([
      { embedding: JSON.stringify(unitEmbedding), confidence: 0.85, isActive: true },
    ]);

    service.extractVoiceFeatures = jest.fn(async () => ({
      embedding: unitEmbedding,
      sampleDuration: 6,
      sampleQuality: 1,
    }));

    const result = await service.verifyVoice('user-1', Buffer.alloc(100));
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });
});
