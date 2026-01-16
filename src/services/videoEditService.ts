import { randomUUID } from 'crypto';
import logger from '../utils/logger';

export type VideoEditAction = 'trim' | 'stitch' | 'overlay';

export interface VideoEditOptions {
  action: VideoEditAction;
  sources: string[];
  startSeconds?: number;
  endSeconds?: number;
  overlayUrl?: string;
  prompt?: string;
  style?: string;
}

export interface VideoEditResult {
  id: string;
  status: 'succeeded' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Lightweight video editing facade.
 * In production, replace with a provider (ffmpeg service or cloud API).
 */
export class VideoEditService {
  private deliveryBase: string;

  constructor() {
    this.deliveryBase = process.env.MEDIA_DELIVERY_BASE || '';
  }

  async edit(options: VideoEditOptions): Promise<VideoEditResult> {
    this.validate(options);
    const id = randomUUID();
    const videoUrl = this.resolveUrl(`/videos/${id}.mp4`);
    const thumbnailUrl = this.resolveUrl(`/videos/${id}.jpg`);

    logger.info('VideoEditService: edit request', {
      action: options.action,
      sources: options.sources,
    });

    return {
      id,
      status: 'succeeded',
      videoUrl,
      thumbnailUrl,
      metadata: {
        action: options.action,
        sources: options.sources,
        startSeconds: options.startSeconds,
        endSeconds: options.endSeconds,
        overlayUrl: options.overlayUrl,
        prompt: options.prompt,
        style: options.style,
      },
    };
  }

  private validate(options: VideoEditOptions): void {
    if (!options.action) throw new Error('Missing action');
    if (!options.sources || options.sources.length === 0)
      throw new Error('Missing sources');

    if (options.action === 'stitch' && options.sources.length < 2) {
      throw new Error('Stitch requires at least two sources');
    }
    if (
      options.action === 'trim' &&
      options.startSeconds === undefined &&
      options.endSeconds === undefined
    ) {
      throw new Error('Trim requires startSeconds or endSeconds');
    }
    if (options.action === 'overlay' && !options.overlayUrl) {
      throw new Error('Overlay requires overlayUrl');
    }
  }

  private resolveUrl(path: string): string {
    if (!this.deliveryBase) {
      return `https://media.local${path}`;
    }
    const safe = encodeURIComponent(path);
    return `${this.deliveryBase}?target=${safe}`;
  }
}
