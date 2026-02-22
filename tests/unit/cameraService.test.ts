import { CameraService } from '../../src/services/cameraService';
import { RTSPStreamService } from '../../src/services/rtspStreamService';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    camera: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    stream: { create: jest.fn(), update: jest.fn() },
    recording: { create: jest.fn() },
    detection: { create: jest.fn() },
  })),
}));

describe('CameraService', () => {
  let prisma: PrismaClient;
  let rtspService: RTSPStreamService;
  let cameraService: CameraService;

  beforeEach(() => {
    prisma = new PrismaClient();
    rtspService = new RTSPStreamService();
    cameraService = new CameraService(prisma, rtspService);
  });

  it('initializes with prisma and rtsp service', () => {
    expect(cameraService).toBeDefined();
  });

  it('can discover ONVIF cameras', async () => {
    const cameras = await cameraService.discoverONVIFCameras(1000);
    expect(Array.isArray(cameras)).toBe(true);
  });
});
