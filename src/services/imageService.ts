import logger from '../utils/logger';

export type ImageAction =
  | 'generate'
  | 'variation'
  | 'inpaint'
  | 'outpaint'
  | 'upscale';

export interface ImageGenerateOptions {
  prompt: string;
  style?: string;
  seed?: number;
  steps?: number;
  width?: number;
  height?: number;
}

export interface ImageEditOptions {
  imageUrl: string;
  maskUrl?: string;
  prompt?: string;
  style?: string;
  strength?: number;
}

export interface ImageResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

interface StabilityResponse {
  id: string;
  image: string;
  thumbnail?: string;
  metadata?: Record<string, unknown>;
}

export class ImageService {
  private baseUrl: string;
  private apiKey: string;
  private retries: number;

  constructor() {
    this.baseUrl = process.env.STABILITY_API_BASE || 'https://api.stability.ai';
    this.apiKey = process.env.STABILITY_API_KEY || '';
    this.retries = Number(process.env.IMAGE_API_RETRIES || 1);
  }

  async generate(opts: ImageGenerateOptions): Promise<ImageResult> {
    return this.callStability('/v1/image/generate', 'generate', opts);
  }

  async variation(opts: ImageEditOptions): Promise<ImageResult> {
    return this.callStability('/v1/image/variation', 'variation', opts);
  }

  async inpaint(opts: ImageEditOptions): Promise<ImageResult> {
    return this.callStability('/v1/image/inpaint', 'inpaint', opts);
  }

  async outpaint(opts: ImageEditOptions): Promise<ImageResult> {
    return this.callStability('/v1/image/outpaint', 'outpaint', opts);
  }

  async upscale(opts: ImageEditOptions): Promise<ImageResult> {
    return this.callStability('/v1/image/upscale', 'upscale', opts);
  }

  private async callStability(
    path: string,
    action: ImageAction,
    payload: Record<string, unknown>,
  ): Promise<ImageResult> {
    if (!this.apiKey) throw new Error('Missing STABILITY_API_KEY');
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Stability API ${res.status}: ${text}`);
        }
        const data = (await res.json()) as StabilityResponse;
        return {
          id: data.id,
          url: data.image,
          thumbnailUrl: data.thumbnail,
          provider: 'stability',
          metadata: { ...data.metadata, action },
        };
      } catch (error) {
        lastErr = error;
        logger.warn('ImageService attempt failed', { action, attempt, error });
      }
    }
    logger.error('ImageService failed all retries', { action, error: lastErr });
    throw new Error('Image service failed');
  }
}
