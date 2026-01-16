import { OnvifClient, PTZPosition, StreamProfile } from './onvifClient';
import { RTSPStreamService } from './rtspStreamService';
import logger from '../utils/logger';
import * as crypto from 'node:crypto';
import { prisma as globalPrisma } from '../utils/prisma';

type PrismaClient = typeof globalPrisma;

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX =
  process.env.CAMERA_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const KEY = Buffer.from(KEY_HEX, 'hex');
const IV_LENGTH = 12;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface CameraConfig {
  name: string;
  protocol: 'onvif' | 'rtsp';
  ipAddress?: string;
  rtspUrl?: string;
  username?: string;
  password: string;
  model?: string;
}

export interface DiscoveredCamera {
  hostname: string;
  port: number;
  name?: string;
  manufacturer?: string;
}

interface OnvifDevice {
  hostname: string;
  port?: number;
  name?: string;
  manufacturer?: string;
}

interface OnvifDiscover {
  on(event: 'device', callback: (device: OnvifDevice) => void): void;
}

interface OnvifCam {
  Discover?: OnvifDiscover;
}

export class CameraService {
  private readonly prisma: PrismaClient;
  private readonly onvifClients: Map<string, OnvifClient> = new Map();
  private readonly rtspService: RTSPStreamService;

  constructor(prisma: PrismaClient, rtspService: RTSPStreamService) {
    this.prisma = prisma;
    this.rtspService = rtspService;
  }

  async discoverONVIFCameras(timeoutMs = 5000): Promise<DiscoveredCamera[]> {
    const timeout = Number(process.env.ONVIF_DISCOVERY_TIMEOUT || timeoutMs);
    logger.info('Starting ONVIF camera discovery', { timeout });

    let Cam: OnvifCam | undefined;
    try {
      const onvifModule = (await import('onvif')) as
        | { Cam?: OnvifCam; default?: { Cam?: OnvifCam } }
        | { default: OnvifCam }
        | OnvifCam;
      Cam =
        ('Cam' in onvifModule && onvifModule.Cam) ||
        ('default' in onvifModule &&
          onvifModule.default &&
          'Cam' in onvifModule.default &&
          onvifModule.default.Cam) ||
        (onvifModule as OnvifCam);
    } catch (error) {
      logger.warn('ONVIF module not available for discovery', { error });
      return [];
    }

    const discover = Cam?.Discover;
    if (!discover) {
      logger.warn('ONVIF Discover not available');
      return [];
    }

    return new Promise((resolve) => {
      const discovered: DiscoveredCamera[] = [];

      discover.on('device', (device: OnvifDevice) => {
        discovered.push({
          hostname: device.hostname,
          port: device.port ?? 80,
          name: device.name,
          manufacturer: device.manufacturer,
        });
      });

      setTimeout(() => {
        logger.info('ONVIF discovery completed', { count: discovered.length });
        resolve(discovered);
      }, timeout);
    });
  }

  async addCamera(config: CameraConfig): Promise<string> {
    const encryptedPassword = encrypt(config.password);

    let capabilities: Record<string, unknown> | null = null;
    if (config.protocol === 'onvif' && config.ipAddress) {
      try {
        const client = new OnvifClient({
          hostname: config.ipAddress,
          port: 80,
          username: config.username || '',
          password: config.password,
        });
        await client.connect();
        const ptzCapabilities = await client.getCapabilities();
        capabilities = ptzCapabilities as unknown as Record<string, unknown>;
        await client.disconnect();
      } catch (error) {
        logger.warn('Failed to fetch ONVIF capabilities during add', { error });
      }
    }

    const camera = await this.prisma.camera.create({
      data: {
        name: config.name,
        protocol: config.protocol,
        ipAddress: config.ipAddress,
        rtspUrl: config.rtspUrl,
        username: config.username,
        password: encryptedPassword,
        model: config.model,
        capabilities,
        isActive: true,
      },
    });

    logger.info('Camera added', { id: camera.id, name: camera.name });
    return camera.id;
  }

  async getCamera(id: string) {
    const camera = await this.prisma.camera.findUnique({
      where: { id },
      include: {
        streams: true,
        recordings: { take: 10, orderBy: { createdAt: 'desc' } },
        detections: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!camera) return null;

    return {
      ...camera,
      password: undefined,
    };
  }

  async listCameras(activeOnly = false) {
    const cameras = await this.prisma.camera.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        streams: { where: { status: 'active' } },
      },
    });

    return cameras.map((c: (typeof cameras)[number]) => ({
      ...c,
      password: undefined,
    }));
  }

  async updateCamera(id: string, updates: Partial<CameraConfig>) {
    const data: Partial<CameraConfig> = { ...updates };
    if (updates.password) {
      data.password = encrypt(updates.password);
    }

    const camera = await this.prisma.camera.update({
      where: { id },
      data,
    });

    logger.info('Camera updated', { id, name: camera.name });
    return camera;
  }

  async deleteCamera(id: string) {
    await this.prisma.camera.delete({ where: { id } });
    await this.rtspService.stopStream(id);
    this.onvifClients.delete(id);
    logger.info('Camera deleted', { id });
  }

  async connectCamera(id: string): Promise<void> {
    const camera = await this.prisma.camera.findUnique({ where: { id } });
    if (!camera) throw new Error('Camera not found');

    if (camera.protocol === 'onvif' && camera.ipAddress) {
      const client = new OnvifClient({
        hostname: camera.ipAddress,
        port: 80,
        username: camera.username || '',
        password: decrypt(camera.password),
      });

      await client.connect();
      this.onvifClients.set(id, client);
      logger.info('ONVIF camera connected', { id, name: camera.name });
    }
  }

  async disconnectCamera(id: string): Promise<void> {
    const client = this.onvifClients.get(id);
    if (client) {
      await client.disconnect();
      this.onvifClients.delete(id);
      logger.info('Camera disconnected', { id });
    }
  }

  async getONVIFClient(id: string): Promise<OnvifClient | null> {
    let client = this.onvifClients.get(id) ?? null;
    if (!client) {
      await this.connectCamera(id);
      client = this.onvifClients.get(id) ?? null;
    }
    return client;
  }

  async getStreamProfiles(id: string): Promise<StreamProfile[]> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.getStreamProfiles();
  }

  async movePTZ(
    id: string,
    options: {
      pan?: number;
      tilt?: number;
      zoom?: number;
      speed?: { pan?: number; tilt?: number; zoom?: number };
    },
  ): Promise<void> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.movePTZ(options);
  }

  async stopPTZ(id: string): Promise<void> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.stopPTZ();
  }

  async getPTZPosition(id: string): Promise<PTZPosition> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.getPTZPosition();
  }

  async setPreset(id: string, token: string, name?: string): Promise<void> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.setPreset(token, name);
  }

  async gotoPreset(id: string, token: string): Promise<void> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.gotoPreset(token);
  }

  async getPresets(
    id: string,
  ): Promise<Array<{ token: string; name: string }>> {
    const client = await this.getONVIFClient(id);
    if (!client) throw new Error('Camera not connected or not ONVIF');
    return client.getPresets();
  }
}
