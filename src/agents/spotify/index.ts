import { BaseAgent } from '../base-agent';
import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  [key: string]: unknown;
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
  };
}

interface TokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string | null;
  tokenType?: string | null;
}

export class SpotifyAgent extends BaseAgent {
  protected agentType = 'spotify';
  protected permissions = ['read:spotify', 'write:spotify'];

  private prisma: PrismaClient;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(prismaClient?: PrismaClient) {
    super();
    this.prisma = prismaClient || new PrismaClient();
    this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      'http://localhost:3000/api/spotify/callback';
  }

  getAuthorizationUrl(userId: string, state: string, scope?: string): string {
    const authScope =
      scope ||
      'user-read-playback-state user-modify-playback-state user-read-currently-playing';

    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.append('client_id', this.clientId);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('redirect_uri', this.redirectUri);
    url.searchParams.append('scope', authScope);
    url.searchParams.append('state', `${state}:${userId}`);
    return url.toString();
  }

  async exchangeCodeForToken(
    code: string,
    userId: string,
  ): Promise<TokenRecord> {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', code);
    body.append('redirect_uri', this.redirectUri);

    const token = await this.requestToken(body);
    await this.saveToken(userId, token);
    return token;
  }

  async refreshAccessToken(userId: string): Promise<TokenRecord | null> {
    const existing = await this.getStoredToken(userId);
    if (!existing?.refreshToken) {
      logger.warn('No refresh token available for Spotify', { userId });
      return null;
    }

    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', existing.refreshToken);

    const token = await this.requestToken(body, existing.refreshToken);
    await this.saveToken(userId, token);
    return token;
  }

  async play(userId: string, trackUri?: string): Promise<void> {
    const token = await this.ensureAccessToken(userId);
    if (!token) throw new Error('No Spotify token available');

    const body = trackUri ? { uris: [trackUri] } : {};

    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async pause(userId: string): Promise<void> {
    const token = await this.ensureAccessToken(userId);
    if (!token) throw new Error('No Spotify token available');

    await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    });
  }

  async search(
    userId: string,
    query: string,
    type: string = 'track',
  ): Promise<SpotifyTrack[]> {
    const token = await this.ensureAccessToken(userId);
    if (!token) throw new Error('No Spotify token available');

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.append('q', query);
    url.searchParams.append('type', type);
    url.searchParams.append('limit', '10');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    });

    const data = (await response.json()) as SpotifySearchResponse;
    return data.tracks?.items || [];
  }

  // Helpers

  private async ensureAccessToken(userId: string): Promise<TokenRecord | null> {
    const token = await this.getStoredToken(userId);
    if (!token) return null;

    const now = Date.now();
    const expiresAtMs = token.expiresAt.getTime();
    if (expiresAtMs - now <= 60_000) {
      // Refresh if expiring in <= 60s
      const refreshed = await this.refreshAccessToken(userId);
      return refreshed;
    }

    return token;
  }

  private async getStoredToken(userId: string): Promise<TokenRecord | null> {
    const record = await this.prisma.spotifyToken.findUnique({
      where: { userId },
    });
    if (!record) return null;

    return {
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expiresAt: record.expiresAt,
      scope: record.scope,
      tokenType: record.tokenType,
    };
  }

  private async saveToken(userId: string, token: TokenRecord): Promise<void> {
    await this.prisma.spotifyToken.upsert({
      where: { userId },
      update: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scope: token.scope ?? null,
        tokenType: token.tokenType ?? null,
      },
      create: {
        userId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scope: token.scope ?? null,
        tokenType: token.tokenType ?? null,
      },
    });
  }

  private async requestToken(
    params: URLSearchParams,
    fallbackRefreshToken?: string,
  ): Promise<TokenRecord> {
    const authHeader = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('Spotify token request failed', {
        status: response.status,
        body: text,
      });
      throw new Error('Spotify token request failed');
    }

    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || fallbackRefreshToken || '',
      expiresAt,
      scope: json.scope,
      tokenType: json.token_type,
    };
  }
}
