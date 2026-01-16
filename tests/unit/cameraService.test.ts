import { CameraService } from '../../src/services/cameraService';
import { RTSPStreamService } from '../../src/services/rtspStreamService';
import { PrismaClient } from '@prisma/client';

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
