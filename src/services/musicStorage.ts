import { randomUUID } from 'crypto';

export interface StoredTrack {
  id: string;
  userId?: string;
  prompt: string;
  style?: string;
  duration: 'hook' | 'full';
  stemsRequested: boolean;
  audioUrl?: string;
  stems?: Record<string, string>;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  safetyDecision?: string;
  createdAt: Date;
}

/**
 * Simple in-memory storage with pluggable URL resolution.
 * In production, replace with database + object storage.
 */
export class MusicStorage {
  private tracks: Map<string, StoredTrack> = new Map();
  private deliveryBase: string;

  constructor() {
    this.deliveryBase = process.env.MUSIC_DELIVERY_BASE || '';
  }

  create(entry: Omit<StoredTrack, 'id' | 'createdAt'>): StoredTrack {
    const id = randomUUID();
    const record: StoredTrack = {
      ...entry,
      id,
      createdAt: new Date(),
    };
    this.tracks.set(id, record);
    return record;
  }

  update(id: string, patch: Partial<StoredTrack>): StoredTrack | null {
    const existing = this.tracks.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.tracks.set(id, updated);
    return updated;
  }

  get(id: string): StoredTrack | null {
    return this.tracks.get(id) || null;
  }

  list(limit = 20): StoredTrack[] {
    return Array.from(this.tracks.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  resolveUrl(remoteUrl?: string): string | undefined {
    if (!remoteUrl) return undefined;
    if (!this.deliveryBase) return remoteUrl;
    const safe = encodeURIComponent(remoteUrl);
    return `${this.deliveryBase}?target=${safe}`;
  }
}
