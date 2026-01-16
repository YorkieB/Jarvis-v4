import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';
import { CameraService } from '../../services/cameraService';
import { RTSPStreamService } from '../../services/rtspStreamService';
import { ComputerVisionService } from '../../services/computerVisionService';
import { RecordingService } from '../../services/recordingService';

export class VisionAgent extends BaseAgent {
  protected agentType = 'vision';
  protected permissions = ['read:vision', 'write:vision', 'control:cameras'];

  private prisma: PrismaClient;
  private cameraService: CameraService;
  private rtspService: RTSPStreamService;
  private cvService: ComputerVisionService;
  private recordingService: RecordingService;

  constructor(
    prisma: PrismaClient,
    cameraService: CameraService,
    rtspService: RTSPStreamService,
    cvService: ComputerVisionService,
    recordingService: RecordingService,
  ) {
    super();
    this.prisma = prisma;
    this.cameraService = cameraService;
    this.rtspService = rtspService;
    this.cvService = cvService;
    this.recordingService = recordingService;
  }

  async discoverCameras(timeoutMs?: number) {
    return this.cameraService.discoverONVIFCameras(timeoutMs);
  }

  async addCamera(config: {
    name: string;
    protocol: 'onvif' | 'rtsp';
    ipAddress?: string;
    rtspUrl?: string;
    username?: string;
    password: string;
    model?: string;
  }) {
    return this.cameraService.addCamera(config);
  }

  async getCamera(id: string) {
    return this.cameraService.getCamera(id);
  }

  async listCameras(activeOnly = false) {
    return this.cameraService.listCameras(activeOnly);
  }

  async connectCamera(id: string) {
    return this.cameraService.connectCamera(id);
  }

  async disconnectCamera(id: string) {
    return this.cameraService.disconnectCamera(id);
  }

  async startStream(cameraId: string) {
    const camera = await this.cameraService.getCamera(cameraId);
    if (!camera) throw new Error('Camera not found');

    let rtspUrl: string;
    if (camera.protocol === 'onvif' && camera.ipAddress) {
      const profiles = await this.cameraService.getStreamProfiles(cameraId);
      rtspUrl = profiles[0]?.rtspUrl || '';
      if (!rtspUrl) throw new Error('No stream profile available');
    } else if (camera.rtspUrl) {
      rtspUrl = camera.rtspUrl;
    } else {
      throw new Error('No RTSP URL available');
    }

    const stream = await this.rtspService.startStream({
      cameraId,
      rtspUrl,
    });

    await this.prisma.stream.create({
      data: {
        cameraId,
        streamUrl: stream.wsUrl,
        status: stream.status,
      },
    });

    return stream;
  }

  async stopStream(cameraId: string) {
    await this.rtspService.stopStream(cameraId);
    await this.prisma.stream.updateMany({
      where: { cameraId },
      data: { status: 'inactive' },
    });
  }

  async movePTZ(
    cameraId: string,
    options: { pan?: number; tilt?: number; zoom?: number; speed?: { pan?: number; tilt?: number; zoom?: number } },
  ) {
    return this.cameraService.movePTZ(cameraId, options);
  }

  async stopPTZ(cameraId: string) {
    return this.cameraService.stopPTZ(cameraId);
  }

  async getPTZPosition(cameraId: string) {
    return this.cameraService.getPTZPosition(cameraId);
  }

  async setPreset(cameraId: string, token: string, name?: string) {
    return this.cameraService.setPreset(cameraId, token, name);
  }

  async gotoPreset(cameraId: string, token: string) {
    return this.cameraService.gotoPreset(cameraId, token);
  }

  async getPresets(cameraId: string) {
    return this.cameraService.getPresets(cameraId);
  }

  async detectObjects(cameraId: string, options?: { frameData?: Buffer; frameUrl?: string; confidenceThreshold?: number }) {
    return this.cvService.detect({
      cameraId,
      frameData: options?.frameData,
      frameUrl: options?.frameUrl,
      confidenceThreshold: options?.confidenceThreshold,
    });
  }

  async queryDetections(filters: {
    cameraId?: string;
    objectType?: string;
    startTime?: Date;
    endTime?: Date;
    minConfidence?: number;
    limit?: number;
  }) {
    return this.cvService.queryDetections(filters);
  }

  async startRecording(config: { cameraIds: string[]; duration?: number; startTime?: Date }) {
    return this.recordingService.startRecording(config);
  }

  async stopRecording(id: string) {
    return this.recordingService.stopRecording(id);
  }

  async listRecordings(filters?: {
    cameraId?: string;
    status?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }) {
    return this.recordingService.listRecordings(filters);
  }

  async getPlaybackUrl(id: string) {
    return this.recordingService.getPlaybackUrl(id);
  }
}
