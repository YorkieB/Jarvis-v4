import logger from '../utils/logger';

export interface VideoGenerateOptions {
  prompt: string;
  style?: string;
  durationSeconds?: number;
}

export interface VideoJob {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface ProviderResponse {
  id: string;
  status: VideoJob['status'];
  video_url?: string;
  thumbnail_url?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export class VideoService {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private maxDuration: number;

  constructor() {
    this.baseUrl = process.env.VIDEO_API_BASE || 'https://api.stability.ai';
    this.apiKey = process.env.VIDEO_API_KEY || '';
    this.timeoutMs = Number(process.env.VIDEO_API_TIMEOUT_MS || 20000);
    this.maxDuration = 15; // seconds cap as requested
  }

  async generate(options: VideoGenerateOptions): Promise<VideoJob> {
    if (!this.apiKey) throw new Error('Missing VIDEO_API_KEY');
    const duration = Math.min(
      options.durationSeconds || this.maxDuration,
      this.maxDuration,
    );
    const payload = { prompt: options.prompt, style: options.style, duration };
    return this.call('/v1/video/generate', payload);
  }

  async getStatus(id: string): Promise<VideoJob> {
    return this.call(`/v1/video/${id}`, undefined, 'GET');
  }

  private async call(
    path: string,
    body?: unknown,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<VideoJob> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Video API ${res.status}: ${text}`);
      }
      const data = (await res.json()) as ProviderResponse;
      return {
        id: data.id,
        status: data.status,
        videoUrl: data.video_url,
        thumbnailUrl: data.thumbnail_url,
        metadata: data.metadata,
        error: data.error,
      };
    } catch (error) {
      logger.error('VideoService call failed', { path, error });
      throw new Error('Video service failed');
    } finally {
      clearTimeout(to);
    }
  }
}
