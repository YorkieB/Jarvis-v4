import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../utils/logger';

export interface DetectionBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  objectType: string;
  confidence: number;
  bbox: DetectionBBox;
  trackingId?: string;
}

export interface DetectionOptions {
  cameraId: string;
  frameData?: Buffer | string;
  frameUrl?: string;
  confidenceThreshold?: number;
}

export class ComputerVisionService {
  private prisma: PrismaClient;
  private confidenceThreshold: number;
  private trackingMap: Map<string, Map<string, string>> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.confidenceThreshold = Number(
      process.env.CV_CONFIDENCE_THRESHOLD || 0.5,
    );
  }

  async detect(options: DetectionOptions): Promise<DetectionResult[]> {
    const threshold = options.confidenceThreshold || this.confidenceThreshold;

    logger.info('Running object detection', {
      cameraId: options.cameraId,
      threshold,
      hasFrameData: !!options.frameData,
      hasFrameUrl: !!options.frameUrl,
    });

    const detections: DetectionResult[] = [];

    if (options.frameData || options.frameUrl) {
      const mockDetections = this.mockDetection(
        options.frameData || options.frameUrl || '',
      );
      detections.push(
        ...mockDetections.filter((d) => d.confidence >= threshold),
      );
    }

    if (detections.length > 0) {
      await this.storeDetections(options.cameraId, detections);
    }

    return detections;
  }

  async trackDetections(
    cameraId: string,
    detections: DetectionResult[],
  ): Promise<DetectionResult[]> {
    const cameraTracks =
      this.trackingMap.get(cameraId) || new Map<string, string>();
    const tracked: DetectionResult[] = [];

    for (const det of detections) {
      const key = `${det.objectType}-${det.bbox.x}-${det.bbox.y}`;
      const existingId = cameraTracks.get(key);
      const trackingId = existingId ?? this.createTrackingId(cameraId);

      if (!existingId) {
        cameraTracks.set(key, trackingId);
      }

      tracked.push({ ...det, trackingId });
    }

    this.trackingMap.set(cameraId, cameraTracks);
    return tracked;
  }

  async queryDetections(filters: {
    cameraId?: string;
    objectType?: string;
    startTime?: Date;
    endTime?: Date;
    minConfidence?: number;
    limit?: number;
  }) {
    const where: Prisma.DetectionWhereInput = {};

    if (filters.cameraId) where.cameraId = filters.cameraId;
    if (filters.objectType) where.objectType = filters.objectType;
    if (filters.startTime || filters.endTime) {
      where.frameTime = {};
      if (filters.startTime) where.frameTime.gte = filters.startTime;
      if (filters.endTime) where.frameTime.lte = filters.endTime;
    }
    if (filters.minConfidence)
      where.confidence = { gte: filters.minConfidence };

    const detections = await this.prisma.detection.findMany({
      where,
      orderBy: { frameTime: 'desc' },
      take: filters.limit || 100,
      include: {
        camera: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return detections;
  }

  private async storeDetections(
    cameraId: string,
    detections: DetectionResult[],
  ): Promise<void> {
    const tracked = await this.trackDetections(cameraId, detections);

    await Promise.all(
      tracked.map((det) =>
        this.prisma.detection.create({
          data: {
            cameraId,
            objectType: det.objectType,
            confidence: det.confidence,
            bbox: {
              x: det.bbox.x,
              y: det.bbox.y,
              width: det.bbox.width,
              height: det.bbox.height,
            } as Prisma.JsonObject,
            frameTime: new Date(),
            trackingId: det.trackingId,
          },
        }),
      ),
    );
  }

  private createTrackingId(cameraId: string): string {
    return `${cameraId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private mockDetection(_frameData: Buffer | string): DetectionResult[] {
    return [
      {
        objectType: 'person',
        confidence: 0.85,
        bbox: { x: 100, y: 150, width: 80, height: 180 },
      },
      {
        objectType: 'vehicle',
        confidence: 0.72,
        bbox: { x: 300, y: 200, width: 200, height: 150 },
      },
    ];
  }
}
