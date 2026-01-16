import { randomUUID } from 'node:crypto';

export type AssetType = 'image' | 'video';
export type AssetStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface StoredAsset {
  id: string;
  type: AssetType;
  prompt: string;
  style?: string;
  seed?: number;
  userId?: string;
  status: AssetStatus;
  safetyDecision?: string;
  url?: string;
  thumbnailUrl?: string;
  variants?: Record<string, string>;
  provider?: string;
  metadata?: Record<string, unknown>;
  sourceAssetIds?: string[];
  action?: string;
  createdAt: Date;
}

/**
 * Simple in-memory storage for media assets.
 * Replace with DB + object storage in production.
 */
export class AssetStorage {
  private readonly assets: Map<string, StoredAsset> = new Map();
  private readonly deliveryBase: string;

  constructor() {
    this.deliveryBase = process.env.MEDIA_DELIVERY_BASE || '';
  }

  create(entry: Omit<StoredAsset, 'id' | 'createdAt'> & { id?: string }): StoredAsset {
    const id = entry.id || randomUUID();
    const asset: StoredAsset = { ...entry, id, createdAt: new Date() };
    this.assets.set(id, asset);
    return asset;
  }

  update(id: string, patch: Partial<StoredAsset>): StoredAsset | null {
    const existing = this.assets.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.assets.set(id, updated);
    return updated;
  }

  get(id: string): StoredAsset | null {
    return this.assets.get(id) || null;
  }

  list(limit = 20): StoredAsset[] {
    return Array.from(this.assets.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((a) => this.resolveDelivery(a));
  }

  resolveDelivery(asset: StoredAsset): StoredAsset {
    return {
      ...asset,
      url: this.resolveUrl(asset.url),
      thumbnailUrl: this.resolveUrl(asset.thumbnailUrl),
      variants: asset.variants
        ? Object.fromEntries(
            Object.entries(asset.variants).map(([k, v]) => [k, this.resolveUrl(v) || v]),
          )
        : undefined,
    };
  }

  private resolveUrl(u?: string): string | undefined {
    if (!u) return undefined;
    if (!this.deliveryBase) return u;
    const safe = encodeURIComponent(u);
    return `${this.deliveryBase}?target=${safe}`;
  }
}
