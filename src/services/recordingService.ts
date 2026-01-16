import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { randomUUID } from 'crypto';

export interface RecordingConfig {
  cameraIds: string[];
  duration?: number;
  startTime?: Date;
}

export interface RecordingStatus {
  id: string;
  cameraId: string;
  status: 'recording' | 'completed' | 'failed';
  filePath?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export class RecordingService {
  private prisma: PrismaClient;
  private storagePath: string;
  private retentionDays: number;
  private activeRecordings: Map<string, NodeJS.Timeout> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.storagePath = process.env.RECORDING_STORAGE_PATH || './recordings';
    this.retentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async startRecording(config: RecordingConfig): Promise<string[]> {
    const recordingIds: string[] = [];

    for (const cameraId of config.cameraIds) {
      const id = randomUUID();
      const fileName = `recording-${cameraId}-${Date.now()}.mp4`;
      const filePath = path.join(this.storagePath, fileName);

      const recording = await this.prisma.recording.create({
        data: {
          id,
          cameraId,
          filePath,
          startTime: config.startTime || new Date(),
          status: 'recording',
        },
      });

      recordingIds.push(id);

      if (config.duration) {
        const timeout = setTimeout(async () => {
          await this.stopRecording(id);
        }, config.duration * 1000);
        this.activeRecordings.set(id, timeout);
      }

      logger.info('Recording started', { id, cameraId, filePath });
    }

    return recordingIds;
  }

  async stopRecording(id: string): Promise<void> {
    const recording = await this.prisma.recording.findUnique({ where: { id } });
    if (!recording) throw new Error('Recording not found');

    const timeout = this.activeRecordings.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.activeRecordings.delete(id);
    }

    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - recording.startTime.getTime()) / 1000);

    let sizeBytes: number | null = null;
    if (fs.existsSync(recording.filePath)) {
      const stats = fs.statSync(recording.filePath);
      sizeBytes = stats.size;
    }

    await this.prisma.recording.update({
      where: { id },
      data: {
        endTime,
        duration,
        sizeBytes,
        status: 'completed',
      },
    });

    logger.info('Recording stopped', { id, duration, sizeBytes });
  }

  async listRecordings(filters?: {
    cameraId?: string;
    status?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }) {
    const where: any = {};

    if (filters?.cameraId) where.cameraId = filters.cameraId;
    if (filters?.status) where.status = filters.status;
    if (filters?.startTime || filters?.endTime) {
      where.startTime = {};
      if (filters.startTime) where.startTime.gte = filters.startTime;
      if (filters.endTime) where.startTime.lte = filters.endTime;
    }

    const recordings = await this.prisma.recording.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: filters?.limit || 50,
      include: {
        camera: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return recordings;
  }

  async getRecording(id: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id },
      include: {
        camera: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return recording;
  }

  async getPlaybackUrl(id: string): Promise<string | null> {
    const recording = await this.getRecording(id);
    if (!recording || !fs.existsSync(recording.filePath)) return null;

    const baseUrl = process.env.RECORDING_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/vision/recordings/${id}/download`;
  }

  async cleanupOldRecordings(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const oldRecordings = await this.prisma.recording.findMany({
      where: {
        startTime: { lt: cutoffDate },
        status: 'completed',
      },
    });

    let deletedCount = 0;

    for (const recording of oldRecordings) {
      try {
        if (fs.existsSync(recording.filePath)) {
          fs.unlinkSync(recording.filePath);
        }
        await this.prisma.recording.delete({ where: { id: recording.id } });
        deletedCount++;
      } catch (error) {
        logger.error('Failed to delete old recording', { id: recording.id, error });
      }
    }

    logger.info('Cleanup completed', { deletedCount, retentionDays: this.retentionDays });
    return deletedCount;
  }
}
