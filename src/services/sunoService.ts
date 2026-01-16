import { randomUUID } from 'crypto';
import logger from '../utils/logger';

export interface SunoGenerateOptions {
  prompt: string;
  style?: string;
  duration?: 'hook' | 'full';
  stems?: boolean;
  tags?: string[];
}

export interface SunoTrack {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  audioUrl?: string;
  stems?: Record<string, string>;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface SunoResponse {
  id: string;
  status: SunoTrack['status'];
  audio_url?: string;
  stems?: Record<string, string>;
  metadata?: Record<string, unknown>;
  error?: string;
}

export class SunoService {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor() {
    this.baseUrl = process.env.SUNO_API_BASE || 'https://api.suno.ai';
    this.apiKey = process.env.SUNO_API_KEY || '';
    this.timeoutMs = Number(process.env.SUNO_API_TIMEOUT_MS || 20000);
  }

  async generate(options: SunoGenerateOptions): Promise<SunoTrack> {
    const requestId = randomUUID();
    try {
      const res = await this.fetchWithAuth('/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId,
        },
        body: JSON.stringify({
          prompt: options.prompt,
          style: options.style,
          duration: options.duration || 'full',
          stems: options.stems ?? false,
          tags: options.tags,
        }),
      });

      return this.toTrack(await res.json());
    } catch (error) {
      logger.error('Suno generate failed', { error, requestId });
      throw new Error('Suno generation failed');
    }
  }

  async getStatus(trackId: string): Promise<SunoTrack> {
    try {
      const res = await this.fetchWithAuth(`/v1/tracks/${trackId}`, {
        method: 'GET',
      });
      return this.toTrack(await res.json());
    } catch (error) {
      logger.error('Suno status failed', { error, trackId });
      throw new Error('Suno status failed');
    }
  }

  async getStems(trackId: string): Promise<Record<string, string>> {
    const track = await this.getStatus(trackId);
    if (!track.stems) {
      throw new Error('Stems not available');
    }
    return track.stems;
  }

  private async fetchWithAuth(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    if (!this.apiKey) throw new Error('Missing SUNO_API_KEY');
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        logger.warn('Suno API non-OK', { status: res.status, text });
        throw new Error(`Suno API error ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(to);
    }
  }

  private toTrack(resp: SunoResponse): SunoTrack {
    return {
      id: resp.id,
      status: resp.status,
      audioUrl: resp.audio_url,
      stems: resp.stems,
      metadata: resp.metadata,
      error: resp.error,
    };
  }
}
